import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { HistoricoLoja } from "@/lib/vendas/calendario";

export type ImportacaoDoDia = Database["public"]["Functions"]["vendas_importacoes_calendario"]["Returns"][number];

/**
 * Importações entre duas datas (dia de São Paulo). A função filtra por
 * perfil: adm/adm_master todas as lojas, gerente a própria.
 */
export async function listarImportacoesCalendario(de: string, ate: string): Promise<ImportacaoDoDia[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_importacoes_calendario", { p_de: de, p_ate: ate });
  if (error) throw error;
  return data ?? [];
}

/**
 * Marcos de cada loja visível (primeira importação, início do registro
 * diário e dias reconstruídos do período) — sem cobrança retroativa.
 */
export async function listarHistoricoCalendario(de: string, ate: string): Promise<Record<string, HistoricoLoja>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_calendario_historico", { p_de: de, p_ate: ate });
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map((h) => [
      h.filial,
      { primeiraImportacao: h.primeira_importacao, inicioRegistro: h.inicio_registro, diasReconstruidos: h.dias_reconstruidos ?? [] },
    ])
  );
}
