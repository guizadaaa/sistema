"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
  nomeCompleto: string;
  email: string;
  perfil: PerfilUsuario;
  filial: FilialCvc | null;
  ativo: boolean;
};

/**
 * A RLS (usuarios_update_adm_master) é a autoridade real sobre quem pode
 * editar — este action não reimplementa essa checagem, só repassa o erro do
 * Postgres de forma legível quando ela rejeitar (ex.: um "adm" tentando
 * editar, o que a UI já evita mas a API continua bloqueando).
 *
 * E-mail é login (fica em auth.users, não só no espelho em public.usuarios)
 * — trocar o e-mail exige a Admin API. Só chama ela quando o valor muda, e
 * só grava em public.usuarios depois dela confirmar, pra nunca deixar login
 * e perfil dessincronizados.
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

  const { data: atual, error: atualError } = await supabase
    .from("usuarios")
    .select("email")
    .eq("id", usuarioId)
    .single();

  if (atualError || !atual) {
    return { error: "Usuário não encontrado." };
  }

  if (parsed.data.email !== atual.email) {
    const admin = createAdminClient();
    const { error: emailError } = await admin.auth.admin.updateUserById(usuarioId, {
      email: parsed.data.email,
    });

    if (emailError) {
      console.error("Erro ao atualizar e-mail do usuário:", emailError);
      return { error: "Não foi possível atualizar o e-mail. Verifique se ele já não está em uso." };
    }
  }

  const { error } = await supabase
    .from("usuarios")
    .update({
      nome_completo: parsed.data.nomeCompleto,
      email: parsed.data.email,
      perfil: parsed.data.perfil,
      filial: parsed.data.filial,
      ativo: parsed.data.ativo,
    })
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

export type GerarLinkAcessoState = {
  link?: string;
  error?: string;
};

/**
 * Alternativa ao convite por e-mail: gera o mesmo link que /auth/confirm já
 * sabe processar (verifyOtp com token_hash+type — ver rota), mas devolve o
 * link pronto em vez de tentar enviar e-mail, para o adm_master copiar e
 * mandar por WhatsApp ou qualquer outro canal quando o envio automático não
 * for viável (SMTP bloqueado, domínio corporativo filtrando, etc.).
 *
 * Sempre usa type=recovery: nesta tela o usuário-alvo já existe em
 * auth.users (é assim que ele aparece na lista, via o trigger
 * on_auth_user_created) — recovery funciona igual para quem nunca definiu
 * senha e para quem só esqueceu, sem a rejeição "email_exists" que o
 * endpoint de convite dá para quem já foi criado.
 */
export async function gerarLinkAcesso(usuarioId: string): Promise<GerarLinkAcessoState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode gerar links de acesso." };
  }

  const supabase = await createClient();
  const { data: alvo, error: alvoError } = await supabase
    .from("usuarios")
    .select("email")
    .eq("id", usuarioId)
    .single();

  if (alvoError || !alvo) {
    return { error: "Usuário não encontrado." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: alvo.email,
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("Erro ao gerar link de acesso:", error);
    return { error: "Não foi possível gerar o link de acesso." };
  }

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const origem = `${protocol}://${host}`;

  const link = `${origem}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`;

  return { link };
}
