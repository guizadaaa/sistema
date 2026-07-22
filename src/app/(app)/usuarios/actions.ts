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
 * A troca de e-mail usa a Admin API (createAdminClient — service role, que
 * bypassa RLS) porque e-mail é login (fica em auth.users, não só no espelho
 * em public.usuarios). Diferente do UPDATE em public.usuarios logo abaixo
 * (que a RLS usuarios_update_adm_master protege de verdade), a chamada à
 * Admin API não passa por RLS nenhuma — por isso a checagem de perfil aqui
 * em cima é obrigatória, não redundante: sem ela, qualquer usuário que
 * consiga ler o e-mail alheio (a si mesmo, ou um gerente vendo um vendedor
 * da própria filial) trocaria o e-mail de login de outra pessoa antes que o
 * UPDATE subsequente fosse rejeitado — o efeito colateral na Admin API já
 * teria acontecido e não é desfeito.
 *
 * Só chama a Admin API quando o valor muda, e só grava em public.usuarios
 * depois dela confirmar, pra nunca deixar login e perfil dessincronizados.
 */
export async function atualizarUsuario(
  usuarioId: string,
  dados: AtualizarUsuarioInput
): Promise<{ error?: string }> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode atualizar usuários." };
  }

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

/**
 * Plano de recuperação para quem perdeu o app autenticador: unenroll exige
 * sessão aal2 (não dá pra se auto-remover sem o próprio código que se
 * perdeu), então o único caminho é um adm_master remover os fatores do
 * colega travado pela Admin API. Depois disso ele loga só com senha e o
 * gate de MFA (requireCurrentUser) o manda reconfigurar do zero.
 *
 * Reset não passa por nenhum trigger de tabela (é uma operação na Admin API
 * do Auth, fora de public.usuarios) — registra manualmente em auditoria,
 * reaproveitando a ação 'update' existente. Falha nesse registro não desfaz
 * o reset em si (a recuperação de acesso é a prioridade), só fica no log do
 * servidor para investigação.
 */
export async function resetarMfaUsuario(usuarioId: string): Promise<{ error?: string }> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode resetar o 2FA de outro usuário." };
  }

  const admin = createAdminClient();
  const { data: fatoresResp, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: usuarioId });
  if (listError) {
    console.error("Erro ao listar fatores MFA do usuário:", listError);
    return { error: "Não foi possível resetar o 2FA deste usuário." };
  }

  for (const fator of fatoresResp.factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: fator.id, userId: usuarioId });
    if (deleteError) {
      console.error("Erro ao remover fator MFA do usuário:", deleteError);
      return { error: "Não foi possível resetar o 2FA deste usuário." };
    }
  }

  const { error: auditoriaError } = await admin.from("auditoria").insert({
    tabela: "usuarios",
    registro_id: usuarioId,
    acao: "update",
    dados_novos: { mfa_reset: true },
    realizado_por: usuario.id,
  });
  if (auditoriaError) {
    console.error("Erro ao registrar reset de MFA em auditoria:", auditoriaError);
  }

  revalidatePath("/usuarios");
  return {};
}
