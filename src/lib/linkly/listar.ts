import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type ResumoVendedorCliques = {
  vendedorId: string;
  vendedorNome: string;
  filial: FilialCvc;
  totalCliques: number;
};

// ----------------------------------------------------------------------------
// Cliques por mês (snapshots diários — 20261006000010). A visibilidade por
// perfil é aplicada dentro das funções do banco, igual às views
// linkly_cliques_por_periodo/linkly_cliques_vitrine.
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
