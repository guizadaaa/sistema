import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type ImportacaoVendas = Database["public"]["Functions"]["listar_vendas_importacoes"]["Returns"][number];

/**
 * Últimas importações por loja, com o status do aviso de cada usuário. A
 * função filtra por perfil: adm/adm_master todas as lojas, gerente a própria.
 */
export async function listarImportacoesVendas(porFilial = 5): Promise<ImportacaoVendas[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_vendas_importacoes", { p_por_filial: porFilial });
  if (error) throw error;
  return data ?? [];
}
