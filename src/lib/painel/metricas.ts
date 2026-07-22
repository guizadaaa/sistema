import "server-only";

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

export type MetricasPainel = {
  total: number;
  porStatus: Record<StatusCaso, number>;
};

/**
 * Mesma base de dados do Dashboard (Acompanhar Casos) — a RLS já decide o
 * escopo por perfil (vendedor: próprios; gerente: filial; admin: tudo), o
 * Painel de Gestão só agrega o que ela libera. Sem SQL de agregação: no
 * volume desta operação (uma franquia, 3 filiais) uma soma em memória sobre
 * as linhas já filtradas é simples e rápida o suficiente — ver decisão
 * registrada na conversa que introduziu o Painel de Gestão.
 */
export async function carregarMetricasPainel(): Promise<MetricasPainel> {
  const supabase = await createClient();

  const { data: casos, error } = await supabase.from("casos").select("status_atual");
  if (error) throw error;

  const porStatus = Object.fromEntries(STATUS_ORDEM.map((s) => [s, 0])) as Record<StatusCaso, number>;
  for (const c of casos ?? []) {
    porStatus[c.status_atual] += 1;
  }

  return { total: casos?.length ?? 0, porStatus };
}
