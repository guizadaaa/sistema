"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const emailSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export type EsqueciSenhaState = {
  enviado?: boolean;
  error?: string;
};

/**
 * Sempre responde com sucesso, exista ou não o e-mail — evita que a tela
 * vire um oráculo para descobrir quais e-mails têm conta no sistema
 * (enumeração de usuários).
 */
export async function solicitarRecuperacaoSenha(
  _prevState: EsqueciSenhaState,
  formData: FormData
): Promise<EsqueciSenhaState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  if (error) {
    console.error("Erro ao solicitar recuperação de senha:", error);
  }

  return { enviado: true };
}
