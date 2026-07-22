"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type RemoverFatorState = { error?: string };

/**
 * unenroll exige sessão aal2 — quem chega até aqui (dentro do grupo (app))
 * já passou pelo gate de requireCurrentUser, então se tem fator verificado
 * já está em aal2. Perfil obrigatório que remove o único fator volta a cair
 * no gate de /mfa/configurar na próxima navegação — comportamento esperado,
 * não precisa de guarda extra aqui.
 */
export async function removerFatorMfa(factorId: string): Promise<RemoverFatorState> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error("Erro ao remover fator MFA:", error);
    return { error: "Não foi possível remover este fator." };
  }

  revalidatePath("/seguranca");
  return {};
}
