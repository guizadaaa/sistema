"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";
import { atualizarUsuarioSchema, convidarUsuarioSchema } from "@/lib/validation/usuario";

export type ConvidarUsuarioState = {
  error?: string;
  sucesso?: boolean;
};

/**
 * Não existe policy de INSERT em public.usuarios (o perfil só nasce via
 * trigger on_auth_user_created) — criar um usuário exige a Admin API do
 * Auth, que bypassa RLS por completo. Por isso o gate de perfil aqui é a
 * única linha de defesa contra um vendedor/gerente convidando alguém.
 */
export async function convidarUsuario(
  _prevState: ConvidarUsuarioState,
  formData: FormData
): Promise<ConvidarUsuarioState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode convidar novos usuários." };
  }

  const parsed = convidarUsuarioSchema.safeParse({
    nomeCompleto: formData.get("nomeCompleto"),
    email: formData.get("email"),
    perfil: formData.get("perfil"),
    filial: formData.get("filial") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = parsed.data;
  const admin = createAdminClient();

  // raw_user_meta_data é lido pelo trigger handle_new_user; filial "" vira
  // NULL lá (nullif(..., '')), o que casa com adm/adm_master não tendo filial.
  const { error } = await admin.auth.admin.inviteUserByEmail(dados.email, {
    data: {
      nome_completo: dados.nomeCompleto,
      perfil: dados.perfil,
      filial: dados.filial ?? "",
    },
  });

  if (error) {
    console.error("Erro ao convidar usuário:", error);
    return { error: "Não foi possível enviar o convite. Verifique se o e-mail já está cadastrado." };
  }

  revalidatePath("/usuarios");
  return { sucesso: true };
}

export type AtualizarUsuarioInput = {
  perfil: PerfilUsuario;
  filial: FilialCvc | null;
  ativo: boolean;
};

/**
 * A RLS (usuarios_update_adm_master) é a autoridade real sobre quem pode
 * editar — este action não reimplementa essa checagem, só repassa o erro do
 * Postgres de forma legível quando ela rejeitar (ex.: um "adm" tentando
 * editar, o que a UI já evita mas a API continua bloqueando).
 */
export async function atualizarUsuario(
  usuarioId: string,
  dados: AtualizarUsuarioInput
): Promise<{ error?: string }> {
  await requireCurrentUser();

  const parsed = atualizarUsuarioSchema.safeParse(dados);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("usuarios")
    .update({ perfil: parsed.data.perfil, filial: parsed.data.filial, ativo: parsed.data.ativo })
    .eq("id", usuarioId);

  if (error) {
    console.error("Erro ao atualizar usuário:", error);
    // reatribuir_casos_ao_desativar_usuario (seção 7) levanta essa exceção
    // quando a filial não tem exatamente 1 gerente ativo para receber os
    // casos do vendedor desativado — mensagem já pronta para o usuário final.
    if (error.message.includes("gerente(s) ativo(s)")) {
      return { error: error.message };
    }
    return { error: "Não foi possível atualizar o usuário. Verifique se você tem permissão para esta ação." };
  }

  revalidatePath("/usuarios");
  return {};
}
