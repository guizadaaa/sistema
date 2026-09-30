import "server-only";

import { duracaoEmDiasFracionarios, formatarDuracaoEmDias } from "@/lib/casos/duracao";
import { situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { STATUS_ORDEM } from "@/lib/casos/status";
import { createClient } from "@/lib/supabase/server";
import type { StatusCaso } from "@/lib/supabase/types";

export { STATUS_ORDEM };

export type CasoParado = {
  id: string;
  protocolo: number;
  clienteNome: string;
  statusAtual: StatusCaso;
  duracaoTexto: string;
};

export type MetricasDashboard = {
  total: number;
  porStatus: Record<StatusCaso, number>;
  prazoVencidos: number;
  prazoVencendo: number;
  /** Todos os casos não resolvidos, do mais parado ao menos — a paginação é da tela (ver paginar()). */
  casosParados: CasoParado[];
};

type CasoResumo = {
  id: string;
  protocolo: number;
  cliente_nome: string;
  status_atual: StatusCaso;
};

type HistoricoComDuracao = { caso_id: string; entrou_em: string; duracao: string };

/**
 * Ordena pelo tempo na etapa ATUAL (agora - entrou_em do status vigente,
 * que zera a cada mudança de status). "Resolvido" sai só desta lista — um
 * caso encerrado não está parado — mas continua contando em total/porStatus.
 */
export function ordenarCasosParados(lista: CasoResumo[], historico: HistoricoComDuracao[]): CasoParado[] {
  // A primeira ocorrência de cada caso_id (ordenado desc por entrou_em) é a
  // etapa atual — status_historico_com_duracao já calcula "agora - entrou_em"
  // para ela (coalesce em 20260716000001_schema.sql).
  const duracaoAtualPorCaso = new Map<string, string>();
  for (const h of [...historico].sort((a, b) => (a.entrou_em < b.entrou_em ? 1 : a.entrou_em > b.entrou_em ? -1 : 0))) {
    if (!duracaoAtualPorCaso.has(h.caso_id)) {
      duracaoAtualPorCaso.set(h.caso_id, h.duracao);
    }
  }

  return lista
    .filter((c) => c.status_atual !== "resolvido")
    .map((c) => {
      const duracao = duracaoAtualPorCaso.get(c.id);
      return {
        id: c.id,
        protocolo: c.protocolo,
        clienteNome: c.cliente_nome,
        statusAtual: c.status_atual,
        duracaoDias: duracao ? duracaoEmDiasFracionarios(duracao) : 0,
        duracaoTexto: duracao ? formatarDuracaoEmDias(duracao) : "—",
      };
    })
    .sort((a, b) => b.duracaoDias - a.duracaoDias)
    .map(({ duracaoDias: _duracaoDias, ...resto }) => resto);
}

/**
 * Mesmo escopo de dados de Acompanhar Casos — a RLS já decide o que cada
 * perfil vê (vendedor só os próprios, gerente a filial, admin tudo); este
 * dashboard é só um resumo agregado do que a RLS já libera, não uma visão
 * de dados nova.
 */
export async function carregarMetricasDashboard(): Promise<MetricasDashboard> {
  const supabase = await createClient();

  const { data: casos, error: casosError } = await supabase
    .from("casos")
    .select("id, protocolo, cliente_nome, status_atual, prazo_vigencia")
    .eq("caso_teste", false);
  if (casosError) throw casosError;

  const lista = casos ?? [];

  const porStatus = Object.fromEntries(STATUS_ORDEM.map((s) => [s, 0])) as Record<StatusCaso, number>;
  let prazoVencidos = 0;
  let prazoVencendo = 0;

  for (const c of lista) {
    porStatus[c.status_atual] += 1;
    const situacao = situacaoPrazoVigencia(c.prazo_vigencia);
    if (situacao === "vencido") prazoVencidos += 1;
    if (situacao === "vencendo") prazoVencendo += 1;
  }

  if (lista.length === 0) {
    return { total: 0, porStatus, prazoVencidos, prazoVencendo, casosParados: [] };
  }

  const { data: historico, error: historicoError } = await supabase
    .from("status_historico_com_duracao")
    .select("caso_id, entrou_em, duracao")
    .order("entrou_em", { ascending: false });
  if (historicoError) throw historicoError;

  const casosParados = ordenarCasosParados(lista, historico ?? []);

  return { total: lista.length, porStatus, prazoVencidos, prazoVencendo, casosParados };
}
