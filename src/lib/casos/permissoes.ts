import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

/**
 * Espelha exatamente a elegibilidade usada nas policies de status_historico
 * e desfechos (auth_is_admin() OR (auth_has_delegacao_ativa() AND mesma
 * filial)) — mantido em um único lugar para a UI decidir o que mostrar sem
 * duplicar a regra, mas o RLS continua sendo quem de fato impõe isso: esta
 * função só evita oferecer botões que resultariam num erro de permissão.
 */
export async function podeConduzirFluxo(usuario: CurrentUser, casoFilial: FilialCvc): Promise<boolean> {
  if (usuario.perfil === "adm" || usuario.perfil === "adm_master") return true;
  if (usuario.perfil !== "gerente" || usuario.filial !== casoFilial) return false;

  const supabase = await createClient();
  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from("delegacoes")
    .select("id")
    .eq("gerente_id", usuario.id)
    .eq("ativa", true)
    .lte("inicio", agora)
    .or(`fim.is.null,fim.gte.${agora}`)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
