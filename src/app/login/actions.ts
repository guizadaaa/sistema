"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Só aceita caminhos relativos internos (começando com uma única "/"), nunca
// URLs absolutas ou protocol-relative ("//evil.com") — evita open redirect
// via ?redirectTo= manipulado num link enviado à vítima.
const safeRedirectPath = z
  .string()
  .optional()
  .transform((value) =>
    value && /^\/(?!\/|\\)/.test(value) && !value.includes("://") ? value : undefined
  );

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  redirectTo: safeRedirectPath,
});

export type LoginState = {
  error?: string;
};

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
    redirectTo: formData.get("redirectTo"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  redirect(parsed.data.redirectTo || "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
