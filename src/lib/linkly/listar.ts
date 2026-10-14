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

// ----------------------------------------------------------------------------
// Cliques por mês (snapshots diários — 20261006000010). A visibilidade por
// perfil é aplicada dentro das funções do banco, igual às views acima.
// ----------------------------------------------------------------------------

export type CliquesMes = {
  mapeamentoId: string;
  linkId: string;
  filial: FilialCvc;
  shortUrl: string;
  usuarioId: string;
  inicio: string;
  fim: string;
  cliques: number;
  /** Mês sem registro anterior: a contagem começa em contagemDesde, não no dia 1. */
  baseParcial: boolean;
  contagemDesde: string | null;
};

/** mes = "YYYY-MM-01". vendedorId opcional (drill-down de gerente/admin). */
export async function listarCliquesDoMes(mes: string, filtros: { vendedorId?: string } = {}): Promise<CliquesMes[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("linkly_cliques_mes", { p_mes: mes });
  if (error) throw error;

  return (data ?? [])
    .filter((r) => !filtros.vendedorId || r.usuario_id === filtros.vendedorId)
    .map((r) => ({
      mapeamentoId: r.mapeamento_id,
      linkId: r.link_id,
      filial: r.filial,
      shortUrl: r.short_url,
      usuarioId: r.usuario_id,
      inicio: r.inicio,
      fim: r.fim,
      cliques: Number(r.cliques),
      baseParcial: r.base_parcial,
      contagemDesde: r.contagem_desde,
    }))
    .sort((a, b) => (a.inicio < b.inicio ? 1 : a.inicio > b.inicio ? -1 : a.shortUrl.localeCompare(b.shortUrl)));
}

export type ResumoVendedorMes = ResumoVendedorCliques & {
  /** Data mais tardia de início da contagem entre os links do vendedor (null = desde o dia 1). */
  contagemDesde: string | null;
};

/** Soma os trechos do mês por vendedor — um vendedor pode ter mais de um link/trecho. */
export function agruparPorVendedor(linhas: CliquesMes[], nomesPorId: Map<string, string>): ResumoVendedorMes[] {
  const acumulado = new Map<string, ResumoVendedorMes>();
  for (const linha of linhas) {
    const desde = linha.baseParcial ? linha.contagemDesde : null;
    const atual = acumulado.get(linha.usuarioId);
    if (!atual) {
      acumulado.set(linha.usuarioId, {
        vendedorId: linha.usuarioId,
        vendedorNome: nomesPorId.get(linha.usuarioId) ?? "—",
        filial: linha.filial,
        totalCliques: linha.cliques,
        contagemDesde: desde,
      });
    } else {
      atual.totalCliques += linha.cliques;
      if (desde && (!atual.contagemDesde || desde > atual.contagemDesde)) atual.contagemDesde = desde;
    }
  }
  return [...acumulado.values()].sort((a, b) => a.vendedorNome.localeCompare(b.vendedorNome, "pt-BR"));
}

export async function listarResumoPorVendedorDoMes(mes: string): Promise<ResumoVendedorMes[]> {
  const linhas = await listarCliquesDoMes(mes);
  const idsVendedores = [...new Set(linhas.map((l) => l.usuarioId))];

  const supabase = await createClient();
  const { data: usuarios, error: usuariosError } =
    idsVendedores.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo").in("id", idsVendedores)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  return agruparPorVendedor(linhas, new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo])));
}

export type VitrineMes = {
  linkId: string;
  filial: FilialCvc;
  shortUrl: string;
  cliques: number;
  baseParcial: boolean;
  contagemDesde: string | null;
};

export async function listarVitrineDoMes(mes: string): Promise<VitrineMes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("linkly_cliques_vitrine_mes", { p_mes: mes });
  if (error) throw error;

  return (data ?? []).map((r) => ({
    linkId: r.link_id,
    filial: r.filial,
    shortUrl: r.short_url,
    cliques: Number(r.cliques),
    baseParcial: r.base_parcial,
    contagemDesde: r.contagem_desde,
  }));
}

/** Meses com pelo menos um snapshot ("YYYY-MM-01"), do mais recente ao mais antigo. */
export async function listarMesesComRegistro(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("linkly_meses_com_registro");
  if (error) throw error;
  return (data ?? []).map((r) => r.mes);
}

/** Hora da sincronização mais recente (maior atualizado_em de linkly_cliques_totais). */
export async function buscarUltimaSincronizacao(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("linkly_ultima_sincronizacao");
  if (error) throw error;
  return data ?? null;
}
