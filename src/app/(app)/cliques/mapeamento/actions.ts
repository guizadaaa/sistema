"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

export type CadastrarLinkState = {
  error?: string;
};

/** RLS (linkly_links_insert) exige auth_is_adm_master() — o gate aqui evita o round-trip. */
export async function cadastrarLink(_prevState: CadastrarLinkState, formData: FormData): Promise<CadastrarLinkState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode cadastrar links." };
  }

  const tipo = String(formData.get("tipo") ?? "");
  const filialRaw = String(formData.get("filial") ?? "");
  const workspaceSecret = String(formData.get("workspaceSecret") ?? "").trim();
  const linklyLinkId = String(formData.get("linklyLinkId") ?? "").trim();
  const shortUrl = String(formData.get("shortUrl") ?? "").trim();

  if (tipo !== "vendedor" && tipo !== "vitrine") {
    return { error: "Selecione o tipo do link." };
  }
  if (tipo === "vendedor" && !(FILIAIS as readonly string[]).includes(filialRaw)) {
    return { error: "Selecione a loja para um link de vendedor." };
  }
  if (!workspaceSecret || !linklyLinkId || !shortUrl) {
    return { error: "Preencha o workspace (nome do secret), o identificador do link e a URL curta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("linkly_links").insert({
    tipo: tipo as "vendedor" | "vitrine",
    filial: tipo === "vendedor" ? (filialRaw as FilialCvc) : null,
    workspace_secret: workspaceSecret,
    linkly_link_id: linklyLinkId,
    short_url: shortUrl,
  });

  if (error) {
    console.error("Erro ao cadastrar link do Linkly:", error);
    if (error.message.includes("duplicate key")) {
      return { error: "Já existe um link cadastrado com este identificador." };
    }
    return { error: "Não foi possível cadastrar o link." };
  }

  revalidatePath("/cliques/mapeamento");
  return {};
}

export type AtribuirVendedorState = {
  error?: string;
};

const MENSAGENS_RPC_REPASSAVEIS = ["responsável vigente", "posterior ao início", 'não é do tipo "vendedor"'];

/**
 * Chama atribuir_vendedor_link() (RPC) — fecha o vínculo vigente (se houver)
 * e abre um novo, atômico. O gate de perfil aqui evita o round-trip; a
 * autoridade real é o auth_is_adm_master() dentro da própria função.
 */
export async function atribuirVendedor(_prevState: AtribuirVendedorState, formData: FormData): Promise<AtribuirVendedorState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode atribuir vendedores a um link." };
  }

  const linkId = String(formData.get("linkId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const vigenteDesde = String(formData.get("vigenteDesde") ?? "").trim();

  if (!linkId) return { error: "Link inválido." };
  if (!email) return { error: "Informe o e-mail do vendedor." };

  const supabase = await createClient();

  const { data: usuarioEncontrado, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (usuarioError) throw usuarioError;
  if (!usuarioEncontrado) {
    return { error: "Nenhum usuário cadastrado com este e-mail." };
  }

  const { error } = await supabase.rpc("atribuir_vendedor_link", {
    p_link_id: linkId,
    p_usuario_id: usuarioEncontrado.id,
    ...(vigenteDesde ? { p_vigente_desde: vigenteDesde } : {}),
  });

  if (error) {
    console.error("Erro ao atribuir vendedor ao link:", error);
    if (MENSAGENS_RPC_REPASSAVEIS.some((trecho) => error.message.includes(trecho))) {
      return { error: error.message };
    }
    return { error: "Não foi possível atribuir o vendedor a este link." };
  }

  revalidatePath("/cliques/mapeamento");
  revalidatePath("/cliques");
  return {};
}
