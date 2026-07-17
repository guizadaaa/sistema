import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type UsuarioListado = Database["public"]["Tables"]["usuarios"]["Row"];

/**
 * RLS (usuarios_select_admin) já restringe SELECT completo de public.usuarios
 * a adm/adm_master — esta função é chamada só depois do gate de página que
 * já exige um desses perfis.
 */
export async function listarUsuarios(): Promise<UsuarioListado[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("usuarios").select("*").order("nome_completo");
  if (error) throw error;
  return data ?? [];
}
