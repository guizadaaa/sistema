"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { caminhoRedirectSeguro } from "@/lib/validation/redirect-path";

// Tipos que este fluxo realmente emite (convite, recuperação/link manual —
// nunca signup/magiclink/email_change).
const TIPOS_SUPORTADOS: readonly string[] = ["invite", "recovery"];

export type ConfirmarAcessoState = {
  error?: string;
};

/**
 * Só roda no clique real do botão (form POST) — nunca num GET simples, que é
 * o que crawlers de prévia de link disparam sozinhos assim que o link é
 * colado numa conversa (WhatsApp, Slack, iMessage etc. pré-buscam a URL para
 * montar o card de prévia, antes de qualquer humano clicar). Um GET que já
 * chamasse verifyOtp diretamente queimaria o token nesse pré-fetch — foi
 * exatamente isso que aconteceu com o link manual gerado em Gestão de
 * Usuários: o token_hash é de uso único, e o crawler do WhatsApp o consumia
 * antes da pessoa abrir o link de verdade.
 */
export async function confirmarAcesso(
  _prevState: ConfirmarAcessoState,
  formData: FormData
): Promise<ConfirmarAcessoState> {
  const tokenHash = formData.get("tokenHash");
  const type = formData.get("type");
  const next = caminhoRedirectSeguro.parse(formData.get("next") || undefined) ?? "/";

  if (typeof tokenHash !== "string" || typeof type !== "string" || !TIPOS_SUPORTADOS.includes(type)) {
    return { error: "Link inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });

  if (error) {
    return { error: "Este link expirou ou já foi usado. Peça um novo." };
  }

  redirect(next);
}
