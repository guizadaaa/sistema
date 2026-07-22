import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type NotificacaoListada = Database["public"]["Tables"]["notificacoes"]["Row"];

/**
 * RLS (notificacoes_select) já restringe a leitura à própria notificação —
 * este limite é só pro sino não carregar um histórico sem fim.
 */
export async function buscarNotificacoesRecentes(limite = 20): Promise<NotificacaoListada[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notificacoes")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;

  return data ?? [];
}

export async function contarNotificacoesNaoLidas(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notificacoes")
    .select("*", { count: "exact", head: true })
    .is("lida_em", null);
  if (error) throw error;

  return count ?? 0;
}
