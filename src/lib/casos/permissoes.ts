import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import type { Database, FilialCvc } from "@/lib/supabase/types";

/**
 * Espelha exatamente a elegibilidade usada nas policies de desfechos e
 * implicações (auth_is_admin() OR (auth_has_delegacao_ativa() AND mesma
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

type CasoParaPermissao = Pick<Database["public"]["Tables"]["casos"]["Row"], "filial" | "vendedor_dono">;

/**
 * Espelha auth_pode_avancar_status (20261006000004): admin; gerente da
 * própria filial, com ou sem delegação; vendedor dono do caso. Só decide o
 * que a tela oferece — status_historico_insert e validar_transicao_status
 * impõem no banco. Desfecho e implicações seguem em podeConduzirFluxo
 * (gerente só com delegação; vendedor nunca).
 */
export async function podeAvancarStatus(usuario: CurrentUser, caso: CasoParaPermissao): Promise<boolean> {
  if (usuario.perfil === "adm" || usuario.perfil === "adm_master") return true;
  if (usuario.perfil === "gerente") return usuario.filial === caso.filial;
  return usuario.perfil === "vendedor" && caso.vendedor_dono === usuario.id;
}
