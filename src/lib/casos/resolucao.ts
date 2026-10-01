import "server-only";

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Não existe coluna resolvido_em em casos — a data de resolução é o
 * entrou_em da entrada mais recente com status "resolvido" em
 * status_historico (a mais recente, porque um caso pode ser reaberto e
 * resolvido de novo). RLS de status_historico espelha a de casos, então só
 * volta o que quem chama já pode ver.
 */
export async function carregarResolvidoEm(supabase: SupabaseClient, casoIds: string[]): Promise<Map<string, string>> {
  const resolvidoEm = new Map<string, string>();
  if (casoIds.length === 0) return resolvidoEm;

  const { data, error } = await supabase
    .from("status_historico")
    .select("caso_id, entrou_em")
    .eq("status", "resolvido")
    .in("caso_id", casoIds);
  if (error) throw error;

  for (const h of data ?? []) {
    const atual = resolvidoEm.get(h.caso_id);
    if (!atual || Date.parse(h.entrou_em) > Date.parse(atual)) resolvidoEm.set(h.caso_id, h.entrou_em);
  }
  return resolvidoEm;
}
