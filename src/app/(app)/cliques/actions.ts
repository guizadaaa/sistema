"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { sincronizarLinkly } from "@/lib/linkly/sincronizar";

export type AtualizarCliquesState = {
  error?: string;
  resultado?: { atualizados: number; erros: number };
};

/** Botão "Atualizar agora" — Adm/Adm Master. Chama a Edge Function direto (sem pg_net). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- assinatura exigida por useActionState, sem campos de formulário nesta action
export async function atualizarCliques(_prevState: AtualizarCliquesState, _formData: FormData): Promise<AtualizarCliquesState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    return { error: "Apenas Adm ou Adm Master podem atualizar os cliques." };
  }

  try {
    const resultado = await sincronizarLinkly();
    revalidatePath("/cliques");
    return { resultado: { atualizados: resultado.atualizados.length, erros: resultado.erros.length } };
  } catch (erro) {
    console.error("Erro ao atualizar cliques do Linkly:", erro);
    return { error: "Não foi possível atualizar os cliques agora. Tente novamente em instantes." };
  }
}
