"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  cookieOptionsSessao,
  SESSAO_INATIVIDADE_MS,
  SESSAO_INICIO_COOKIE,
  SESSAO_TIME_BOX_MS,
  ULTIMA_ATIVIDADE_COOKIE,
} from "@/lib/auth/sessao";
import { createClient } from "@/lib/supabase/server";
import { caminhoRedirectSeguro } from "@/lib/validation/redirect-path";

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  redirectTo: caminhoRedirectSeguro,
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

  // Grava explicitamente aqui (caminho comum — login por senha) em vez de
  // depender só do "self-healing" do proxy: garante que o time-box conta a
  // partir de agora, mesmo que o navegador ainda tivesse esses cookies de
  // uma sessão anterior (evita herdar um relógio antigo num login rápido
  // logo após um logout).
  const cookieStore = await cookies();
  const agora = String(Date.now());
  cookieStore.set(SESSAO_INICIO_COOKIE, agora, cookieOptionsSessao(SESSAO_TIME_BOX_MS));
  cookieStore.set(ULTIMA_ATIVIDADE_COOKIE, agora, cookieOptionsSessao(SESSAO_INATIVIDADE_MS));

  redirect(parsed.data.redirectTo || "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(SESSAO_INICIO_COOKIE);
  cookieStore.delete(ULTIMA_ATIVIDADE_COOKIE);

  redirect("/login");
}
