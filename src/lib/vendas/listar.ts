import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type VendaListada = {
  id: string;
  filial: FilialCvc;
  dataVenda: string;
  pagante: string;
  produto: string;
  valorTotal: number;
};

export type PeriodoFilial = { filial: string; de: string; ate: string };

export type FiltrosVendas = {
  vendedorId?: string;
  /** Cada filial no próprio período (mês de referência ou período escolhido). */
  periodos: PeriodoFilial[];
};

const DATA_FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/** Filtro PostgREST: (filial = X e data no período de X) ou (filial = Y …). */
function filtroPeriodos(periodos: PeriodoFilial[]): string {
  return periodos
    .filter((p) => DATA_FORMATO.test(p.de) && DATA_FORMATO.test(p.ate))
    .map((p) => `and(filial.eq.${p.filial},data_venda.gte.${p.de},data_venda.lte.${p.ate})`)
    .join(",");
}

/**
 * RLS (vendas_com_vendedor) já decide o escopo por perfil — vendedor: só as
 * próprias; gerente: só a própria filial; adm/adm_master: tudo. Os períodos
 * aqui são só um recorte dentro do que a RLS já libera, nunca uma forma de
 * ver mais do que o perfil já pode (mesmo princípio de listarCasos).
 */
export async function listarVendas(filtros: FiltrosVendas): Promise<VendaListada[]> {
  const ou = filtroPeriodos(filtros.periodos);
  if (!ou) return [];
  const supabase = await createClient();

  let query = supabase
    .from("vendas_com_vendedor")
    .select("id, filial, data_venda, pagante, produto, valor_total")
    .or(ou)
    .order("data_venda", { ascending: false });

  if (filtros.vendedorId) query = query.eq("usuario_id", filtros.vendedorId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((v) => ({
    id: v.id,
    filial: v.filial,
    dataVenda: v.data_venda,
    pagante: v.pagante,
    produto: v.produto,
    valorTotal: v.valor_total,
  }));
}

export type ResumoVendedor = {
  vendedorId: string;
  vendedorNome: string;
  filial: FilialCvc;
  quantidade: number;
  total: number;
};

/**
 * Visão agregada por vendedor pra gerente/adm/adm_master — só linhas já
 * resolvidas (usuario_id preenchido); pendentes de vínculo têm sua própria
 * tela (Mapeamento). Soma no banco (vendas_resumo_periodos, security invoker
 * sobre a mesma view), cada filial no seu período.
 */
export async function listarResumoPorVendedor(periodos: PeriodoFilial[]): Promise<ResumoVendedor[]> {
  if (periodos.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("vendas_resumo_periodos", { p_periodos: periodos });
  if (error) throw error;

  const linhas = data ?? [];
  const idsVendedores = linhas.map((l) => l.usuario_id);
  const { data: usuarios, error: usuariosError } =
    idsVendedores.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo").in("id", idsVendedores)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));
  return linhas
    .map((l) => ({
      vendedorId: l.usuario_id,
      vendedorNome: nomesPorId.get(l.usuario_id) ?? "—",
      filial: l.filial,
      quantidade: Number(l.quantidade),
      total: Number(l.total),
    }))
    .sort((a, b) => a.vendedorNome.localeCompare(b.vendedorNome, "pt-BR"));
}

/** Última importação ("vendas até") de cada loja visível. */
export async function listarReferenciasVendas(): Promise<{ loja: string; ate: string | null; importadoEm: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_referencia_lojas", {});
  if (error) throw error;
  return (data ?? []).map((r) => ({ loja: r.loja, ate: r.ate, importadoEm: r.importado_em }));
}
