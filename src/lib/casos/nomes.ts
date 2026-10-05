import "server-only";

import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Nome de quem criou, é dono, avançou status ou comentou nos casos
 * informados. Nunca SELECT direto em usuarios: a RLS de lá só mostra ao
 * vendedor a própria linha e ao gerente a própria filial (por isso aparecia
 * "—" para eles). A função nomes_usuarios_casos (SECURITY DEFINER) devolve
 * só id + nome, e só de casos que quem chama já enxerga.
 */
export async function carregarNomesUsuariosCasos(
  supabase: SupabaseClient,
  casoIds: string[]
): Promise<Map<string, string>> {
  if (casoIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc("nomes_usuarios_casos", { p_caso_ids: casoIds });
  if (error) throw error;

  return new Map((data ?? []).map((u) => [u.id, u.nome_completo]));
}
