import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AcaoAuditoria, Database } from "@/lib/supabase/types";

export type AuditoriaListada = Database["public"]["Tables"]["auditoria"]["Row"] & {
  realizadoPorNome: string;
};

export type FiltrosAuditoria = {
  tabela?: string;
  acao?: AcaoAuditoria;
};

/**
 * RLS (auditoria_select_adm_master) já restringe a leitura a adm_master —
 * esta função é chamada só depois do gate de página que já exige esse
 * perfil, mas a query funcionaria igual (resultado vazio) para qualquer
 * outro perfil.
 */
export async function listarAuditoria(filtros: FiltrosAuditoria): Promise<AuditoriaListada[]> {
  const supabase = await createClient();

  let query = supabase
    .from("auditoria")
    .select("*")
    .order("realizado_em", { ascending: false })
    .limit(200);

  if (filtros.tabela) query = query.eq("tabela", filtros.tabela);
  if (filtros.acao) query = query.eq("acao", filtros.acao);

  const { data: registros, error } = await query;
  if (error) throw error;
  if (!registros || registros.length === 0) return [];

  const ids = [...new Set(registros.map((r) => r.realizado_por))];
  const { data: usuarios, error: usuariosError } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .in("id", ids);
  if (usuariosError) throw usuariosError;

  const nomesPorId = new Map((usuarios ?? []).map((u) => [u.id, u.nome_completo]));

  return registros.map((r) => ({
    ...r,
    realizadoPorNome: nomesPorId.get(r.realizado_por) ?? "—",
  }));
}
