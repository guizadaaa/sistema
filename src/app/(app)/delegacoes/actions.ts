"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { criarDelegacaoSchema } from "@/lib/validation/delegacao";

export type CriarDelegacaoState = {
  error?: string;
};

/**
 * A RLS (delegacoes_insert) já restringe o INSERT a adm_master, e o trigger
 * validate_delegacao garante que gerente_id é de fato um gerente e que não
 * há sobreposição de delegação vigente — este action só repassa esses erros
 * de forma legível.
 */
export async function criarDelegacao(
  _prevState: CriarDelegacaoState,
  formData: FormData
): Promise<CriarDelegacaoState> {
  const usuario = await requireCurrentUser();

  const parsed = criarDelegacaoSchema.safeParse({
    gerenteId: formData.get("gerenteId"),
    fim: formData.get("fim") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("delegacoes").insert({
    adm_id: usuario.id,
    gerente_id: parsed.data.gerenteId,
    // Fim do dia selecionado, não meia-noite — evita a delegação aparecer
    // encerrada antes do fim do próprio dia escolhido como término.
    fim: parsed.data.fim ? new Date(`${parsed.data.fim}T23:59:59`).toISOString() : null,
  });

  if (error) {
    console.error("Erro ao criar delegação:", error);
    return {
      error: error.message.includes("delegação vigente")
        ? "Já existe uma delegação vigente para este gerente."
        : "Não foi possível criar a delegação. Verifique se você tem permissão para esta ação.",
    };
  }

  revalidatePath("/delegacoes");
  return {};
}

export async function encerrarDelegacao(delegacaoId: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("delegacoes")
    .update({ ativa: false, fim: new Date().toISOString() })
    .eq("id", delegacaoId);

  if (error) {
    console.error("Erro ao encerrar delegação:", error);
    return { error: "Não foi possível encerrar a delegação." };
  }

  revalidatePath("/delegacoes");
  return {};
}
