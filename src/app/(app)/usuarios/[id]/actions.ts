"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

export type TransferirLojaState = { error?: string; ok?: boolean };

/**
 * Permissão e efeito (usuarios.filial, histórico, vínculo do Linkly) ficam
 * em transferir_usuario_loja() — roda como o próprio usuário.
 */
export async function transferirLoja(_prev: TransferirLojaState, formData: FormData): Promise<TransferirLojaState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil === "vendedor") return { error: "Sem permissão para transferir usuários." };

  const usuarioId = String(formData.get("usuarioId") ?? "");
  const lojaPara = String(formData.get("lojaPara") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim();
  if (!usuarioId) return { error: "Usuário inválido." };
  if (!(FILIAIS as readonly string[]).includes(lojaPara)) return { error: "Escolha a loja de destino." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("transferir_usuario_loja", {
    p_usuario_id: usuarioId,
    p_loja_para: lojaPara as FilialCvc,
    p_observacao: observacao || null,
  });
  if (error) {
    // 42501/22023: mensagens da própria função (permissão, mesma loja...).
    if (error.code === "42501" || error.code === "22023") return { error: error.message };
    console.error("Erro ao transferir usuário de loja:", error);
    return { error: "Não foi possível transferir o usuário." };
  }

  revalidatePath(`/usuarios/${usuarioId}`);
  revalidatePath("/usuarios");
  return { ok: true };
}
