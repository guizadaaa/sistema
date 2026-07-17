import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type DelegacaoListada = Database["public"]["Tables"]["delegacoes"]["Row"] & {
  gerenteNome: string;
  admNome: string;
};

/**
 * RLS (delegacoes_select) já restringe as linhas visíveis: adm_master vê
 * todas, gerente só as próprias — nenhum filtro adicional necessário aqui.
 */
export async function listarDelegacoes(): Promise<DelegacaoListada[]> {
  const supabase = await createClient();

  const { data: delegacoes, error } = await supabase
    .from("delegacoes")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw error;
  if (!delegacoes || delegacoes.length === 0) return [];

  const ids = [...new Set(delegacoes.flatMap((d) => [d.adm_id, d.gerente_id]))];
  const { data: usuarios, error: usuariosError } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .in("id", ids);
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  return delegacoes.map((d) => ({
    ...d,
    admNome: nomesPorId.get(d.adm_id) ?? "—",
    gerenteNome: nomesPorId.get(d.gerente_id) ?? "—",
  }));
}
