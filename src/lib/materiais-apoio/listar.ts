import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type MaterialApoio = Database["public"]["Tables"]["materiais_apoio"]["Row"];
export type CategoriaMaterialApoio = Database["public"]["Tables"]["materiais_apoio_categorias"]["Row"];

/**
 * RLS (materiais_apoio_select) já libera pra qualquer perfil ativo, sem
 * recorte de filial — documentos aqui são materiais corporativos (manuais,
 * políticas, scripts de atendimento), não dado de um caso ou vendedor.
 */
export async function listarMateriaisApoio(): Promise<MaterialApoio[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("materiais_apoio")
    .select("*")
    .order("enviado_em", { ascending: false });
  if (error) throw error;

  return data ?? [];
}

/** Todos os perfis ativos enxergam (materiais_apoio_categorias_select) — são as opções do filtro. */
export async function listarCategoriasMateriaisApoio(): Promise<CategoriaMaterialApoio[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("materiais_apoio_categorias").select("*").order("nome");
  if (error) throw error;

  return data ?? [];
}
