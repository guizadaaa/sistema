import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database, FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export type UsuarioListado = Database["public"]["Tables"]["usuarios"]["Row"];

export type FiltrosUsuarios = {
  filial?: FilialCvc;
  perfil?: PerfilUsuario;
};

/**
 * RLS (usuarios_select_admin) já restringe SELECT completo de public.usuarios
 * a adm/adm_master — esta função é chamada só depois do gate de página que
 * já exige um desses perfis.
 */
export async function listarUsuarios(filtros: FiltrosUsuarios = {}): Promise<UsuarioListado[]> {
  const supabase = await createClient();
  let query = supabase.from("usuarios").select("*").order("nome_completo");
  if (filtros.filial) query = query.eq("filial", filtros.filial);
  if (filtros.perfil) query = query.eq("perfil", filtros.perfil);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
