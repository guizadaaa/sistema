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

/**
 * Chamada pelo pop-up de prazo (polling próprio, mesmo intervalo do sino)
 * — só os marcos de prazo ainda não lidos, nunca as outras 2 categorias
 * (caso_novo/delegacao_expirando não têm o mesmo caráter de urgência
 * "chame mais atenção que o sino").
 */
export async function buscarPrazosNaoLidos(): Promise<NotificacaoListada[]> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("tipo", "prazo_vencendo")
    .is("lida_em", null)
    .order("marco_dias", { ascending: true });
  if (error) throw error;

  return data ?? [];
}

export async function marcarTodosPrazosComoLidos(): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notificacoes")
    .update({ lida_em: new Date().toISOString() })
    .eq("tipo", "prazo_vencendo")
    .is("lida_em", null);
  if (error) {
    console.error("Erro ao marcar prazos como lidos:", error);
    return { error: "Não foi possível marcar todos como lidos." };
  }

  return {};
}
