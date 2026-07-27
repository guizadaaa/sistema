"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

export type CriarMapeamentoState = {
  error?: string;
};

/**
 * RLS (vendedores_mapeamento_insert) exige auth_is_adm_master() — o gate
 * aqui evita o round-trip pra quem nunca teria a gravação aceita. O trigger
 * validate_vendedor_mapeamento é a autoridade real sobre overlap de período
 * pro mesmo (nome_planilha, filial); esta action só traduz a exceção dele.
 */
export async function criarMapeamento(_prevState: CriarMapeamentoState, formData: FormData): Promise<CriarMapeamentoState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") {
    return { error: "Apenas o adm_master pode gerenciar vínculos de vendedores." };
  }

  const nomePlanilha = String(formData.get("nomePlanilha") ?? "").trim();
  const filial = String(formData.get("filial") ?? "");
  const semConta = formData.get("semConta") === "1";
  const email = String(formData.get("email") ?? "").trim();
  const vigenteDesde = String(formData.get("vigenteDesde") ?? "").trim() || null;
  const vigenteAte = String(formData.get("vigenteAte") ?? "").trim() || null;

  if (!nomePlanilha) {
    return { error: "Informe o nome exatamente como aparece na planilha." };
  }
  if (!(FILIAIS as readonly string[]).includes(filial)) {
    return { error: "Selecione uma loja válida." };
  }
  if (vigenteDesde && vigenteAte && vigenteDesde > vigenteAte) {
    return { error: "A data de início não pode ser depois da data de fim." };
  }

  const supabase = await createClient();

  let usuarioId: string | null = null;
  if (!semConta) {
    if (!email) {
      return { error: "Informe o e-mail do usuário, ou marque \"sem conta\" para um ex-funcionário." };
    }

    const { data: usuarioEncontrado, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (usuarioError) throw usuarioError;
    if (!usuarioEncontrado) {
      return { error: "Nenhum usuário cadastrado com este e-mail." };
    }
    usuarioId = usuarioEncontrado.id;
  }

  const { error } = await supabase.from("vendedores_mapeamento").insert({
    nome_planilha: nomePlanilha,
    filial: filial as FilialCvc,
    usuario_id: usuarioId,
    vigente_desde: vigenteDesde,
    vigente_ate: vigenteAte,
  });

  if (error) {
    console.error("Erro ao criar vínculo de vendedor:", error);
    if (error.message.includes("período sobreposto")) {
      return { error: `Já existe um vínculo para "${nomePlanilha}" nesta loja com período sobreposto.` };
    }
    return { error: "Não foi possível criar o vínculo." };
  }

  revalidatePath("/vendas/mapeamento");
  revalidatePath("/vendas");
  return {};
}
