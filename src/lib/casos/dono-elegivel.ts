import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type DonoElegivel = {
  id: string;
  nome_completo: string;
};

/**
 * Lista de possíveis "donos do caso" para o seletor do formulário, seguindo
 * a seção 2 da spec:
 *   - vendedor: só ele mesmo (não escolhe).
 *   - gerente: ele mesmo + vendedores ativos da própria filial.
 *   - adm/adm_master: ele mesmo + qualquer usuário ativo, qualquer filial.
 */
export async function listarDonosElegiveis(usuario: CurrentUser): Promise<DonoElegivel[]> {
  if (usuario.perfil === "vendedor") {
    return [{ id: usuario.id, nome_completo: usuario.nome_completo }];
  }

  const supabase = await createClient();

  if (usuario.perfil === "gerente") {
    if (!usuario.filial) {
      // Invariante do banco (usuarios_filial_por_perfil): gerente sempre
      // tem filial. Falhar alto aqui é melhor que seguir com uma consulta
      // sem sentido (filial = null casaria com nada mesmo).
      throw new Error("Gerente sem filial definida — dado inconsistente");
    }

    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome_completo")
      .eq("filial", usuario.filial)
      .eq("perfil", "vendedor")
      .eq("ativo", true)
      .order("nome_completo");

    if (error) throw error;

    const vendedores = data ?? [];
    const jaIncluiSelf = vendedores.some((v) => v.id === usuario.id);
    return jaIncluiSelf
      ? vendedores
      : [{ id: usuario.id, nome_completo: usuario.nome_completo }, ...vendedores];
  }

  // adm / adm_master: qualquer pessoa ativa, qualquer filial.
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome_completo")
    .eq("ativo", true)
    .order("nome_completo");

  if (error) throw error;

  const todos = data ?? [];
  const jaIncluiSelf = todos.some((u) => u.id === usuario.id);
  return jaIncluiSelf ? todos : [{ id: usuario.id, nome_completo: usuario.nome_completo }, ...todos];
}
