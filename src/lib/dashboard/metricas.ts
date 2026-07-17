import "server-only";

import { duracaoEmDiasFracionarios, formatarDuracaoEmDias } from "@/lib/casos/duracao";
import { situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { createClient } from "@/lib/supabase/server";
import type { StatusCaso } from "@/lib/supabase/types";

export const STATUS_ORDEM: readonly StatusCaso[] = [
  "inicial",
  "recepcionado",
  "em_andamento_interno",
  "reavaliacao",
  "resolvido",
  "ouvidoria",
];

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
  casosParados: CasoParado[];
};

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
    .select("id, protocolo, cliente_nome, status_atual, prazo_vigencia");
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

  // A primeira ocorrência de cada caso_id (ordenado desc por entrou_em) é a
  // etapa atual — status_historico_com_duracao já calcula "agora - entrou_em"
  // para ela (coalesce em 20260716000001_schema.sql).
  const duracaoAtualPorCaso = new Map<string, string>();
  for (const h of historico ?? []) {
    if (!duracaoAtualPorCaso.has(h.caso_id)) {
      duracaoAtualPorCaso.set(h.caso_id, h.duracao);
    }
  }

  const casosParados = lista
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
    .slice(0, 10)
    .map(({ duracaoDias: _duracaoDias, ...resto }) => resto);

  return { total: lista.length, porStatus, prazoVencidos, prazoVencendo, casosParados };
}
