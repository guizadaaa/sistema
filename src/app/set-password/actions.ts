"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const senhaSchema = z
  .object({
    senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
    confirmarSenha: z.string(),
  })
  .refine((v) => v.senha === v.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });

export type DefinirSenhaState = {
  error?: string;
};

/**
 * Só chega aqui com uma sessão válida — estabelecida por /auth/confirm
 * (verifyOtp do convite ou da recuperação de senha) antes do redirect pra
 * esta página. Sem sessão, não há o que atualizar.
 */
export async function definirSenha(_prevState: DefinirSenhaState, formData: FormData): Promise<DefinirSenhaState> {
  const parsed = senhaSchema.safeParse({
    senha: formData.get("senha"),
    confirmarSenha: formData.get("confirmarSenha"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) {
    console.error("Erro ao definir senha:", error);
    return { error: "Não foi possível definir a senha. Tente novamente." };
  }

  redirect("/");
}
