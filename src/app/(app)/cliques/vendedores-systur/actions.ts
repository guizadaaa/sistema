"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type SalvarVinculoSysturState = { error?: string; ok?: boolean };

/**
 * Atualiza vínculo, login e ativo de um nome do Systur. RLS
 * (systur_vendedor_mapeamento_update) exige auth_is_admin(); o gate aqui
 * evita o round-trip. O trigger systur_mapeamento_propagar_vinculo leva o
 * vínculo para reservas/recibos/clientes já recebidos.
 */
export async function salvarVinculoSystur(
  _prevState: SalvarVinculoSysturState,
  formData: FormData
): Promise<SalvarVinculoSysturState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    return { error: "Apenas administradores podem alterar o mapeamento." };
  }

  const id = String(formData.get("id") ?? "");
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const loginSystur = String(formData.get("loginSystur") ?? "").trim().toUpperCase();
  if (!id) return { error: "Linha inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("systur_vendedor_mapeamento")
    .update({
      usuario_id: usuarioId && usuarioId !== "nenhum" ? usuarioId : null,
      login_systur: loginSystur || null,
      ativo: formData.get("ativo") === "1",
    })
    .eq("id", id)
    .select("id");

  if (error || !data?.length) {
    console.error("Erro ao salvar vínculo do Systur:", error);
    return { error: "Não foi possível salvar o vínculo." };
  }

  revalidatePath("/cliques/vendedores-systur");
  return { ok: true };
}
