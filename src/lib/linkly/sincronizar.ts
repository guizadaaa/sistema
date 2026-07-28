import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoSincronizacaoLinkly = {
  ok: boolean;
  atualizados: { link_id: string; linkly_link_id: string; total_cliques: number }[];
  erros: { escopo: string; mensagem: string }[];
};

/**
 * Chama a Edge Function sincronizar-linkly diretamente (não via pg_net) —
 * usa a service_role_key que o servidor Next.js já tem (mesma de
 * createAdminClient), não a do Vault. Esse é o caminho do botão "Atualizar
 * agora": diferente do disparo por pg_cron (que precisa do mecanismo
 * commit-antes-de-coletar do pg_net porque roda dentro do Postgres), aqui é
 * só um fetch HTTP comum a partir do servidor — sem nenhuma das restrições de
 * transação que forçaram disparar_sincronizacao_linkly a virar uma procedure
 * sem security definer.
 */
export async function sincronizarLinkly(): Promise<ResultadoSincronizacaoLinkly> {
  const admin = createAdminClient();
  const { data, error } = await admin.functions.invoke("sincronizar-linkly", { body: {} });
  if (error) throw new Error(`Falha ao chamar a sincronização do Linkly: ${error.message}`);
  return data as ResultadoSincronizacaoLinkly;
}
