import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type PeriodoCliques = {
  mapeamentoId: string;
  linkId: string;
  filial: FilialCvc;
  shortUrl: string;
  vigenteDesde: string;
  vigenteAte: string | null;
  cliquesPeriodo: number;
  cliquesAtualizadoEm: string;
};

export type FiltrosCliques = {
  vendedorId?: string;
  filial?: FilialCvc;
};

/**
 * RLS (linkly_cliques_por_periodo) já decide o escopo por perfil — vendedor:
 * só as próprias linhas (mesmo entre links diferentes, se já ocupou mais de
 * um posto); gerente: só a própria filial; adm/adm_master: tudo. Mesmo
 * princípio de listarVendas.
 */
export async function listarCliquesPorPeriodo(filtros: FiltrosCliques = {}): Promise<PeriodoCliques[]> {
  const supabase = await createClient();

  let query = supabase
    .from("linkly_cliques_por_periodo")
    .select("mapeamento_id, link_id, filial, short_url, usuario_id, vigente_desde, vigente_ate, cliques_periodo, cliques_atualizado_em")
    .order("vigente_desde", { ascending: false });

  if (filtros.vendedorId) query = query.eq("usuario_id", filtros.vendedorId);
  if (filtros.filial) query = query.eq("filial", filtros.filial);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((r) => ({
    mapeamentoId: r.mapeamento_id,
    linkId: r.link_id,
    filial: r.filial,
    shortUrl: r.short_url,
    vigenteDesde: r.vigente_desde,
    vigenteAte: r.vigente_ate,
    cliquesPeriodo: r.cliques_periodo,
    cliquesAtualizadoEm: r.cliques_atualizado_em,
  }));
}

export type ResumoVendedorCliques = {
  vendedorId: string;
  vendedorNome: string;
  filial: FilialCvc;
  totalCliques: number;
};

/**
 * Soma cliques_periodo por vendedor (todas as linhas dele, incluindo
 * períodos/links antigos) — mesmo padrão de listarResumoPorVendedor (vendas).
 */
export async function listarResumoPorVendedor(filtros: Pick<FiltrosCliques, "filial"> = {}): Promise<ResumoVendedorCliques[]> {
  const supabase = await createClient();

  let query = supabase.from("linkly_cliques_por_periodo").select("filial, usuario_id, cliques_periodo");
  if (filtros.filial) query = query.eq("filial", filtros.filial);

  const { data, error } = await query;
  if (error) throw error;

  const linhas = (data ?? []) as { filial: FilialCvc; usuario_id: string; cliques_periodo: number }[];
  const idsVendedores = [...new Set(linhas.map((l) => l.usuario_id))];

  const { data: usuarios, error: usuariosError } =
    idsVendedores.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo").in("id", idsVendedores)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  const acumulado = new Map<string, ResumoVendedorCliques>();
  for (const linha of linhas) {
    const atual = acumulado.get(linha.usuario_id);
    if (!atual) {
      acumulado.set(linha.usuario_id, {
        vendedorId: linha.usuario_id,
        vendedorNome: nomesPorId.get(linha.usuario_id) ?? "—",
        filial: linha.filial,
        totalCliques: linha.cliques_periodo,
      });
    } else {
      atual.totalCliques += linha.cliques_periodo;
    }
  }

  return [...acumulado.values()].sort((a, b) => a.vendedorNome.localeCompare(b.vendedorNome, "pt-BR"));
}

export type CliquesVitrine = {
  linkId: string;
  shortUrl: string;
  totalCliques: number;
  atualizadoEm: string;
  filial: FilialCvc;
};

/**
 * Um link de vitrine por loja (mesmo workspace Linkly nos 3) — a view já
 * restringe a leitura: adm/adm_master veem os 3, gerente só o da própria loja.
 */
export async function listarCliquesVitrine(): Promise<CliquesVitrine[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("linkly_cliques_vitrine")
    .select("link_id, short_url, total_cliques, atualizado_em, filial");
  if (error) throw error;

  return (data ?? []).map((r) => ({
    linkId: r.link_id,
    shortUrl: r.short_url,
    totalCliques: r.total_cliques,
    atualizadoEm: r.atualizado_em,
    filial: r.filial,
  }));
}
