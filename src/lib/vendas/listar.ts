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

export type FiltrosVendas = {
  vendedorId?: string;
  filial?: FilialCvc;
  dataInicio?: string;
  dataFim?: string;
};

const DATA_FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * RLS (vendas_com_vendedor) já decide o escopo por perfil — vendedor: só as
 * próprias; gerente: só a própria filial; adm/adm_master: tudo. Os filtros
 * aqui são só um recorte dentro do que a RLS já libera, nunca uma forma de
 * ver mais do que o perfil já pode (mesmo princípio de listarCasos).
 */
export async function listarVendas(filtros: FiltrosVendas = {}): Promise<VendaListada[]> {
  const supabase = await createClient();

  let query = supabase
    .from("vendas_com_vendedor")
    .select("id, filial, data_venda, pagante, produto, valor_total")
    .order("data_venda", { ascending: false });

  if (filtros.vendedorId) query = query.eq("usuario_id", filtros.vendedorId);
  if (filtros.filial) query = query.eq("filial", filtros.filial);
  if (filtros.dataInicio && DATA_FORMATO.test(filtros.dataInicio)) query = query.gte("data_venda", filtros.dataInicio);
  if (filtros.dataFim && DATA_FORMATO.test(filtros.dataFim)) query = query.lte("data_venda", filtros.dataFim);

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
 * tela (Mapeamento), não fazem sentido misturados aqui (não há "vendedor"
 * pra agrupar).
 */
export async function listarResumoPorVendedor(filtros: Pick<FiltrosVendas, "filial" | "dataInicio" | "dataFim"> = {}): Promise<ResumoVendedor[]> {
  const supabase = await createClient();

  let query = supabase
    .from("vendas_com_vendedor")
    .select("filial, usuario_id, valor_total")
    .not("usuario_id", "is", null);

  if (filtros.filial) query = query.eq("filial", filtros.filial);
  if (filtros.dataInicio && DATA_FORMATO.test(filtros.dataInicio)) query = query.gte("data_venda", filtros.dataInicio);
  if (filtros.dataFim && DATA_FORMATO.test(filtros.dataFim)) query = query.lte("data_venda", filtros.dataFim);

  const { data, error } = await query;
  if (error) throw error;

  const linhas = (data ?? []) as { filial: FilialCvc; usuario_id: string; valor_total: number }[];
  const idsVendedores = [...new Set(linhas.map((l) => l.usuario_id))];

  const { data: usuarios, error: usuariosError } =
    idsVendedores.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo").in("id", idsVendedores)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  const acumulado = new Map<string, ResumoVendedor>();
  for (const linha of linhas) {
    const atual = acumulado.get(linha.usuario_id);
    if (!atual) {
      acumulado.set(linha.usuario_id, {
        vendedorId: linha.usuario_id,
        vendedorNome: nomesPorId.get(linha.usuario_id) ?? "—",
        filial: linha.filial,
        quantidade: 1,
        total: linha.valor_total,
      });
    } else {
      atual.quantidade++;
      atual.total += linha.valor_total;
    }
  }

  return [...acumulado.values()].sort((a, b) => a.vendedorNome.localeCompare(b.vendedorNome, "pt-BR"));
}
