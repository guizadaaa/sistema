import "server-only";

import { createClient, type Session } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

import { carregarUsuarioConferencia, type UsuarioConferencia } from "./auth";
import { erro, json } from "./respostas";

export type RespostaSessao = {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  usuario: UsuarioConferencia;
};

/** Client anônimo sem persistência — só para login/refresh por senha. */
export function clientAuthConferencia() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/** Sessão do Supabase -> resposta da API (403 se o usuário não estiver ativo na Aura). */
export async function respostaDaSessao(session: Session): Promise<Response> {
  const usuario = await carregarUsuarioConferencia(session.user.id);
  if (!usuario) return erro(403, "Usuário sem acesso à Aura (inativo ou sem perfil).");
  const corpo: RespostaSessao = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    usuario,
  };
  return json(corpo);
}
