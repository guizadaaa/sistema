"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { MATERIAL_APOIO_MIME_TYPES, MATERIAL_APOIO_TAMANHO_MAXIMO_BYTES } from "@/lib/validation/material-apoio";

export type EnviarMaterialApoioState = {
  error?: string;
};

/**
 * RLS (materiais_apoio_insert / storage_materiais_apoio_insert) é a
 * autoridade real (auth_is_admin() — cobre adm e adm_master, mesma função
 * usada em todo o resto do sistema para essa distinção); o gate aqui evita
 * um round-trip desnecessário de upload pra quem nunca teria a inserção
 * aceita, mesmo padrão de convidarUsuario em usuarios/actions.ts.
 */
export async function enviarMaterialApoio(
  _prevState: EnviarMaterialApoioState,
  formData: FormData
): Promise<EnviarMaterialApoioState> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    return { error: "Apenas adm ou adm_master pode enviar materiais de apoio." };
  }

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Informe um título para o material." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione um arquivo PDF." };
  }
  if (!(MATERIAL_APOIO_MIME_TYPES as readonly string[]).includes(arquivo.type)) {
    return { error: "Formato não permitido (só PDF)." };
  }
  if (arquivo.size > MATERIAL_APOIO_TAMANHO_MAXIMO_BYTES) {
    return { error: "Arquivo maior que 10 MB." };
  }

  const supabase = await createClient();
  const storagePath = `${randomUUID()}-${arquivo.name}`;

  const { error: uploadError } = await supabase.storage
    .from("materiais-apoio")
    .upload(storagePath, arquivo, { contentType: arquivo.type });
  if (uploadError) {
    console.error("Erro ao enviar material de apoio:", uploadError);
    return { error: "Não foi possível enviar o arquivo. Tente novamente." };
  }

  const { error: insertError } = await supabase
    .from("materiais_apoio")
    .insert({ titulo, storage_path: storagePath, nome_arquivo: arquivo.name });
  if (insertError) {
    console.error("Erro ao registrar material de apoio:", insertError);
    return { error: "Arquivo enviado, mas não foi possível registrá-lo. Tente novamente." };
  }

  revalidatePath("/materiais");
  return {};
}

/**
 * Download via signed URL de curta duração, mesmo padrão de
 * gerarUrlAssinadaAnexo — sem log de acesso dedicado aqui: diferente de
 * anexos (documento de caso, pode conter dado sensível do cliente — LGPD
 * §12), materiais de apoio são conteúdo corporativo (manuais, políticas),
 * sem justificativa equivalente para auditoria de download.
 */
export async function gerarUrlAssinadaMaterialApoio(storagePath: string): Promise<{ url?: string; error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase.storage.from("materiais-apoio").createSignedUrl(storagePath, 60);
  if (error || !data) {
    console.error("Erro ao gerar signed URL de material de apoio:", error);
    return { error: "Não foi possível gerar o link de download." };
  }

  return { url: data.signedUrl };
}
