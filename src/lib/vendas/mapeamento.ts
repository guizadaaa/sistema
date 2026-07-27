import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type MapeamentoComUsuario = {
  id: string;
  nome_planilha: string;
  filial: FilialCvc;
  usuario_id: string | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  vigente_desde: string | null;
  vigente_ate: string | null;
  criado_em: string;
};

/** RLS (vendedores_mapeamento_select) já restringe a leitura a adm_master. */
export async function listarMapeamentos(): Promise<MapeamentoComUsuario[]> {
  const supabase = await createClient();

  const { data: mapeamentos, error } = await supabase
    .from("vendedores_mapeamento")
    .select("id, nome_planilha, filial, usuario_id, vigente_desde, vigente_ate, criado_em")
    .order("nome_planilha")
    .order("filial");
  if (error) throw error;

  const idsUsuarios = [...new Set((mapeamentos ?? []).map((m) => m.usuario_id).filter((id): id is string => id !== null))];
  const { data: usuarios, error: usuariosError } =
    idsUsuarios.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo, email").in("id", idsUsuarios)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  const usuariosPorId = new Map((usuarios ?? []).map((u) => [u.id, u]));

  return (mapeamentos ?? []).map((m) => ({
    ...m,
    usuarioNome: m.usuario_id ? (usuariosPorId.get(m.usuario_id)?.nome_completo ?? "—") : null,
    usuarioEmail: m.usuario_id ? (usuariosPorId.get(m.usuario_id)?.email ?? "—") : null,
  }));
}

export type PendenteDeVinculo = {
  filial: FilialCvc;
  vendedorNomePlanilha: string;
  quantidade: number;
  primeiraVenda: string;
  ultimaVenda: string;
};

/**
 * Agrupa por (filial, vendedor_nome_planilha) os registros de
 * vendas_com_vendedor sem nenhum vendedores_mapeamento correspondente
 * (mapeamento_id nulo) — nunca some silenciosamente, sempre visível pra
 * adm/adm_master (mesma RLS de vendas_com_vendedor já libera isso).
 */
export async function listarPendentesDeVinculo(): Promise<PendenteDeVinculo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vendas_com_vendedor")
    .select("filial, vendedor_nome_planilha, data_venda")
    .is("mapeamento_id", null);
  if (error) throw error;

  const grupos = new Map<string, PendenteDeVinculo>();
  for (const v of data ?? []) {
    const chave = `${v.filial}::${v.vendedor_nome_planilha}`;
    const atual = grupos.get(chave);
    if (!atual) {
      grupos.set(chave, {
        filial: v.filial,
        vendedorNomePlanilha: v.vendedor_nome_planilha,
        quantidade: 1,
        primeiraVenda: v.data_venda,
        ultimaVenda: v.data_venda,
      });
    } else {
      atual.quantidade++;
      if (v.data_venda < atual.primeiraVenda) atual.primeiraVenda = v.data_venda;
      if (v.data_venda > atual.ultimaVenda) atual.ultimaVenda = v.data_venda;
    }
  }

  return [...grupos.values()].sort(
    (a, b) => a.filial.localeCompare(b.filial) || a.vendedorNomePlanilha.localeCompare(b.vendedorNomePlanilha, "pt-BR")
  );
}
