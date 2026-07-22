"use server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarNotificacoesRecentes, contarNotificacoesNaoLidas, type NotificacaoListada } from "@/lib/notificacoes/listar";
import { createClient } from "@/lib/supabase/server";

export type SinoNotificacoesState = {
  naoLidas: number;
  recentes: NotificacaoListada[];
};

/**
 * Chamada pelo sino (polling a cada 30s, não formulário) — requireCurrentUser
 * redireciona pro /login se a sessão expirou enquanto a aba ficava aberta,
 * igual a qualquer outra ação deste app.
 */
export async function buscarSinoNotificacoes(): Promise<SinoNotificacoesState> {
  await requireCurrentUser();

  const [naoLidas, recentes] = await Promise.all([contarNotificacoesNaoLidas(), buscarNotificacoesRecentes(10)]);

  return { naoLidas, recentes };
}

export async function marcarNotificacaoComoLida(id: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.from("notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("Erro ao marcar notificação como lida:", error);
    return { error: "Não foi possível marcar como lida." };
  }

  return {};
}

export async function marcarTodasNotificacoesComoLidas(): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notificacoes")
    .update({ lida_em: new Date().toISOString() })
    .is("lida_em", null);
  if (error) {
    console.error("Erro ao marcar notificações como lidas:", error);
    return { error: "Não foi possível marcar todas como lidas." };
  }

  return {};
}
