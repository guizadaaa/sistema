"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  ehTipoArquivoMaterialApoio,
  normalizarUrlMaterialApoio,
  validarArquivoMaterialApoio,
  type TipoArquivoMaterialApoio,
} from "@/lib/validation/material-apoio";

export type MaterialApoioFormState = {
  error?: string;
  ok?: boolean;
};

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// Postgres: unique_violation / foreign_key_violation.
const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";

/**
 * RLS (materiais_apoio_insert/_update/_delete e as policies do bucket) é a
 * autoridade real (auth_is_admin() — cobre adm e adm_master, mesma função
 * usada em todo o resto do sistema para essa distinção); o gate aqui evita
 * um round-trip desnecessário de upload pra quem nunca teria a gravação
 * aceita, mesmo padrão de convidarUsuario em usuarios/actions.ts.
 */
async function exigirAdmin(): Promise<string | undefined> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    return "Apenas adm ou adm_master pode gerenciar materiais de apoio.";
  }
  return undefined;
}

/** Categorias: RLS materiais_apoio_categorias_* exige auth_is_adm_master(). */
async function exigirAdmMaster(): Promise<string | undefined> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm_master") return "Apenas adm_master pode gerenciar categorias.";
  return undefined;
}

function lerCategoriaId(formData: FormData): string | null {
  const valor = String(formData.get("categoria_id") ?? "");
  return valor && valor !== "sem-categoria" ? valor : null;
}

function lerArquivo(formData: FormData): File | undefined {
  const arquivo = formData.get("arquivo");
  return arquivo instanceof File && arquivo.size > 0 ? arquivo : undefined;
}

async function subirArquivo(
  supabase: SupabaseServer,
  arquivo: File
): Promise<{ storagePath?: string; error?: string }> {
  const storagePath = `${randomUUID()}-${arquivo.name}`;
  const { error } = await supabase.storage
    .from("materiais-apoio")
    .upload(storagePath, arquivo, { contentType: arquivo.type });
  if (error) {
    console.error("Erro ao enviar arquivo de material de apoio:", error);
    return { error: "Não foi possível enviar o arquivo. Tente novamente." };
  }
  return { storagePath };
}

/** Falha aqui só deixa um objeto órfão no bucket — loga, mas não desfaz a operação que já deu certo. */
async function removerArquivo(supabase: SupabaseServer, storagePath: string) {
  const { error } = await supabase.storage.from("materiais-apoio").remove([storagePath]);
  if (error) console.error(`Erro ao remover arquivo antigo de material de apoio (${storagePath}):`, error);
}

export async function enviarMaterialApoio(
  _prevState: MaterialApoioFormState,
  formData: FormData
): Promise<MaterialApoioFormState> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };

  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Informe um título para o material." };

  const categoriaId = lerCategoriaId(formData);
  const supabase = await createClient();

  if (formData.get("modo") === "link") {
    const url = normalizarUrlMaterialApoio(String(formData.get("url") ?? ""));
    if (!url) return { error: "Informe um link válido (começando com http:// ou https://)." };

    const { error } = await supabase.from("materiais_apoio").insert({ titulo, tipo: "link", url, categoria_id: categoriaId });
    if (error) {
      console.error("Erro ao registrar link de material de apoio:", error);
      return { error: "Não foi possível salvar o link. Tente novamente." };
    }

    revalidatePath("/materiais");
    return { ok: true };
  }

  const tipo = formData.get("tipo");
  if (!ehTipoArquivoMaterialApoio(tipo)) return { error: "Selecione o tipo do arquivo." };

  const arquivo = lerArquivo(formData);
  if (!arquivo) return { error: tipo === "imagem" ? "Selecione ou cole uma imagem." : "Selecione um arquivo." };
  const erroArquivo = validarArquivoMaterialApoio(tipo, arquivo);
  if (erroArquivo) return { error: erroArquivo };

  const { storagePath, error: uploadError } = await subirArquivo(supabase, arquivo);
  if (!storagePath) return { error: uploadError };

  const { error: insertError } = await supabase
    .from("materiais_apoio")
    .insert({ titulo, tipo, storage_path: storagePath, nome_arquivo: arquivo.name, categoria_id: categoriaId });
  if (insertError) {
    console.error("Erro ao registrar material de apoio:", insertError);
    await removerArquivo(supabase, storagePath);
    return { error: "Não foi possível registrar o material. Tente novamente." };
  }

  revalidatePath("/materiais");
  return { ok: true };
}

/**
 * Renomear, trocar categoria, editar url (link) ou substituir o arquivo
 * (demais tipos). Substituir sobe o novo com outro storage_path, aponta o
 * registro pra ele e só então apaga o antigo do bucket — se o update falhar,
 * quem sai é o novo, e o material continua íntegro.
 */
export async function editarMaterialApoio(
  _prevState: MaterialApoioFormState,
  formData: FormData
): Promise<MaterialApoioFormState> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };

  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Informe um título para o material." };
  const categoriaId = lerCategoriaId(formData);

  const supabase = await createClient();
  const { data: atual, error: atualError } = await supabase
    .from("materiais_apoio")
    .select("id, tipo, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (atualError || !atual) {
    if (atualError) console.error("Erro ao carregar material de apoio para edição:", atualError);
    return { error: "Material não encontrado." };
  }

  if (atual.tipo === "link") {
    const url = normalizarUrlMaterialApoio(String(formData.get("url") ?? ""));
    if (!url) return { error: "Informe um link válido (começando com http:// ou https://)." };

    const { data, error } = await supabase
      .from("materiais_apoio")
      .update({ titulo, url, categoria_id: categoriaId })
      .eq("id", id)
      .select("id");
    if (error || !data?.length) {
      console.error("Erro ao editar link de material de apoio:", error);
      return { error: "Não foi possível salvar as alterações. Tente novamente." };
    }

    revalidatePath("/materiais");
    return { ok: true };
  }

  const arquivo = lerArquivo(formData);
  let novo: { tipo: TipoArquivoMaterialApoio; storage_path: string; nome_arquivo: string } | undefined;

  if (arquivo) {
    const tipo = formData.get("tipo");
    if (!ehTipoArquivoMaterialApoio(tipo)) return { error: "Selecione o tipo do novo arquivo." };
    const erroArquivo = validarArquivoMaterialApoio(tipo, arquivo);
    if (erroArquivo) return { error: erroArquivo };

    const { storagePath, error: uploadError } = await subirArquivo(supabase, arquivo);
    if (!storagePath) return { error: uploadError };
    novo = { tipo, storage_path: storagePath, nome_arquivo: arquivo.name };
  }

  const { data, error } = await supabase
    .from("materiais_apoio")
    .update({ titulo, categoria_id: categoriaId, ...novo })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    console.error("Erro ao editar material de apoio:", error);
    if (novo) await removerArquivo(supabase, novo.storage_path);
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  if (novo && atual.storage_path) await removerArquivo(supabase, atual.storage_path);

  revalidatePath("/materiais");
  return { ok: true };
}

/** Apaga o registro e depois o arquivo — nunca deixa um registro apontando pra arquivo inexistente. */
export async function excluirMaterialApoio(id: string): Promise<{ error?: string }> {
  const bloqueio = await exigirAdmin();
  if (bloqueio) return { error: bloqueio };

  const supabase = await createClient();
  const { data, error } = await supabase.from("materiais_apoio").delete().eq("id", id).select("storage_path");
  if (error || !data?.length) {
    console.error("Erro ao excluir material de apoio:", error);
    return { error: "Não foi possível excluir o material." };
  }

  const storagePath = data[0].storage_path;
  if (storagePath) await removerArquivo(supabase, storagePath);

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

// ----------------------------------------------------------------------------
// Categorias (só adm_master)
// ----------------------------------------------------------------------------

function mensagemErroCategoria(error: { code?: string }, padrao: string): string {
  if (error.code === PG_UNIQUE_VIOLATION) return "Já existe uma categoria com esse nome.";
  return padrao;
}

export async function criarCategoriaMaterialApoio(
  _prevState: MaterialApoioFormState,
  formData: FormData
): Promise<MaterialApoioFormState> {
  const bloqueio = await exigirAdmMaster();
  if (bloqueio) return { error: bloqueio };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome da categoria." };

  const supabase = await createClient();
  const { error } = await supabase.from("materiais_apoio_categorias").insert({ nome });
  if (error) {
    console.error("Erro ao criar categoria de material de apoio:", error);
    return { error: mensagemErroCategoria(error, "Não foi possível criar a categoria.") };
  }

  revalidatePath("/materiais");
  return { ok: true };
}

export async function renomearCategoriaMaterialApoio(
  _prevState: MaterialApoioFormState,
  formData: FormData
): Promise<MaterialApoioFormState> {
  const bloqueio = await exigirAdmMaster();
  if (bloqueio) return { error: bloqueio };

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o nome da categoria." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("materiais_apoio_categorias").update({ nome }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("Erro ao renomear categoria de material de apoio:", error);
    return { error: error ? mensagemErroCategoria(error, "Não foi possível renomear a categoria.") : "Categoria não encontrada." };
  }

  revalidatePath("/materiais");
  return { ok: true };
}

export async function excluirCategoriaMaterialApoio(id: string): Promise<{ error?: string }> {
  const bloqueio = await exigirAdmMaster();
  if (bloqueio) return { error: bloqueio };

  const supabase = await createClient();
  const { data, error } = await supabase.from("materiais_apoio_categorias").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("Erro ao excluir categoria de material de apoio:", error);
    if (error?.code === PG_FK_VIOLATION) {
      return { error: "Categoria em uso — mova ou exclua os materiais dela antes." };
    }
    return { error: "Não foi possível excluir a categoria." };
  }

  revalidatePath("/materiais");
  return {};
}
