"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";
import { validarLinkVitrine, validarValidadeVitrine } from "@/lib/validation/vitrine";

export type VitrineFormState = { error?: string; ok?: boolean };

const CAMINHO = "/materiais/vitrine";
const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";
const MAX_PAGINAS = 200;

function ehFilial(valor: unknown): valor is FilialCvc {
  return typeof valor === "string" && (FILIAIS as readonly string[]).includes(valor);
}

/**
 * Gate de UX — a autoridade é a RLS (vitrine_pode_editar): adm/adm_master
 * em qualquer filial; gerente na própria. Evita, por exemplo, gerar URL de
 * upload para quem nunca teria a gravação aceita.
 */
async function exigirEditor(filial: FilialCvc): Promise<string | undefined> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil === "adm" || usuario.perfil === "adm_master") return undefined;
  if (usuario.perfil === "gerente" && usuario.filial === filial) return undefined;
  return "Sem permissão para editar a vitrine desta filial.";
}

/** Link preenchido fora de cvc.com.br só passa com a confirmação da tela. */
function lerLink(valor: unknown, confirmado: boolean): { link: string | null } | { error: string } {
  const resultado = validarLinkVitrine(typeof valor === "string" ? valor : "");
  if (!resultado.ok) return { error: resultado.erro };
  if (!resultado.dominioCvc && !confirmado) return { error: "Confirme o link fora de cvc.com.br." };
  return { link: resultado.url };
}

// ----------------------------------------------------------------------------
// Categorias
// ----------------------------------------------------------------------------

export async function criarCategoriaVitrine(_prev: VitrineFormState, formData: FormData): Promise<VitrineFormState> {
  const filial = formData.get("filial");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!ehFilial(filial)) return { error: "Filial inválida." };
  if (!nome) return { error: "Informe o nome da categoria." };
  const bloqueio = await exigirEditor(filial);
  if (bloqueio) return { error: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase.from("vitrine_categorias").insert({ filial, nome });
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { error: "Já existe uma categoria com esse nome nesta filial." };
    console.error("Erro ao criar categoria da vitrine:", error);
    return { error: "Não foi possível criar a categoria." };
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function atualizarCategoriaVitrine(
  id: string,
  dados: { nome?: string; ativo?: boolean }
): Promise<{ error?: string }> {
  await requireCurrentUser();
  const nome = dados.nome?.trim();
  if (dados.nome !== undefined && !nome) return { error: "Informe o nome da categoria." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_categorias")
    .update({ ...(nome !== undefined && { nome }), ...(dados.ativo !== undefined && { ativo: dados.ativo }) })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (error?.code === PG_UNIQUE_VIOLATION) return { error: "Já existe uma categoria com esse nome nesta filial." };
    console.error("Erro ao atualizar categoria da vitrine:", error);
    return { error: "Não foi possível salvar a categoria." };
  }
  revalidatePath(CAMINHO);
  return {};
}

export async function excluirCategoriaVitrine(id: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("vitrine_categorias").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    if (error?.code === PG_FK_VIOLATION) return { error: "Categoria com ofertas — exclua ou mova as ofertas antes." };
    console.error("Erro ao excluir categoria da vitrine:", error);
    return { error: "Não foi possível excluir a categoria." };
  }
  revalidatePath(CAMINHO);
  return {};
}

export async function moverVitrine(tabela: "categoria" | "oferta", id: string, direcao: -1 | 1): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("vitrine_mover", { p_tabela: tabela, p_id: id, p_direcao: direcao });
  if (error) {
    console.error("Erro ao reordenar a vitrine:", error);
    return { error: "Não foi possível reordenar." };
  }
  revalidatePath(CAMINHO);
  return {};
}

// ----------------------------------------------------------------------------
// Envio do PDF: direto do navegador para o Storage
// ----------------------------------------------------------------------------

export type EnvioPreparado = {
  arquivoId: string;
  uploads: { caminho: string; token: string; tipo: "application/pdf" | "image/png"; pagina: number | null }[];
};

/**
 * URLs assinadas de upload (PDF + um PNG por página), criadas com a sessão
 * do usuário — passam pela policy storage_vitrine_insert. O navegador sobe
 * os arquivos direto no Supabase Storage; nada passa por aqui.
 */
export async function prepararEnvioVitrine(filial: FilialCvc, paginas: number): Promise<EnvioPreparado | { error: string }> {
  if (!ehFilial(filial)) return { error: "Filial inválida." };
  if (!Number.isInteger(paginas) || paginas < 1 || paginas > MAX_PAGINAS) return { error: "PDF sem páginas válidas." };
  const bloqueio = await exigirEditor(filial);
  if (bloqueio) return { error: bloqueio };

  const arquivoId = randomUUID();
  const alvos: Omit<EnvioPreparado["uploads"][number], "token">[] = [
    { caminho: `${filial}/${arquivoId}.pdf`, tipo: "application/pdf", pagina: null },
    ...Array.from({ length: paginas }, (_, i) => ({
      caminho: `${filial}/${arquivoId}/p${i + 1}.png`,
      tipo: "image/png" as const,
      pagina: i + 1,
    })),
  ];

  const supabase = await createClient();
  const uploads: EnvioPreparado["uploads"] = [];
  for (const alvo of alvos) {
    const { data, error } = await supabase.storage.from("vitrine").createSignedUploadUrl(alvo.caminho);
    if (error || !data) {
      console.error("Erro ao gerar URL de upload da vitrine:", error);
      return { error: "Não foi possível preparar o envio. Tente novamente." };
    }
    uploads.push({ ...alvo, token: data.token });
  }
  return { arquivoId, uploads };
}

export type OfertaRevisada = { pagina: number | null; titulo: string; link: string; validade: string };

export async function salvarEnvioVitrine(entrada: {
  arquivoId: string;
  filial: FilialCvc;
  categoriaId: string;
  titulo: string;
  paginas: number;
  capaPagina: number | null;
  ofertas: OfertaRevisada[];
  copiarPara: FilialCvc[];
  linksExternosConfirmados: boolean;
}): Promise<VitrineFormState> {
  if (!ehFilial(entrada.filial)) return { error: "Filial inválida." };
  const bloqueio = await exigirEditor(entrada.filial);
  if (bloqueio) return { error: bloqueio };
  if (!entrada.titulo.trim()) return { error: "Informe o título da vitrine." };
  if (!entrada.categoriaId) return { error: "Escolha a categoria." };
  if (entrada.ofertas.length === 0) return { error: "Nenhuma oferta para salvar (todas as páginas marcadas como capa?)." };
  if (!entrada.copiarPara.every(ehFilial)) return { error: "Filial de cópia inválida." };

  const ofertas = [];
  for (const [i, oferta] of entrada.ofertas.entries()) {
    const rotulo = oferta.pagina ? `Página ${oferta.pagina}` : `Oferta ${i + 1}`;
    if (!oferta.titulo.trim()) return { error: `${rotulo}: informe o título.` };
    const link = lerLink(oferta.link, entrada.linksExternosConfirmados);
    if ("error" in link) return { error: `${rotulo}: ${link.error}` };
    const validade = validarValidadeVitrine(oferta.validade);
    if (!validade.ok) return { error: `${rotulo}: ${validade.erro}` };
    ofertas.push({ pagina: oferta.pagina, titulo: oferta.titulo.trim(), link: link.link, validade: validade.data });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("vitrine_salvar_envio", {
    p_arquivo_id: entrada.arquivoId,
    p_filial: entrada.filial,
    p_categoria_id: entrada.categoriaId,
    p_titulo: entrada.titulo.trim(),
    p_paginas: entrada.paginas,
    p_capa_pagina: entrada.capaPagina,
    p_ofertas: ofertas,
    p_copiar_para: entrada.copiarPara,
  });
  if (error) {
    console.error("Erro ao salvar a vitrine:", error);
    if (error.code === "42501" || error.code === "22023") return { error: error.message };
    return { error: "Não foi possível salvar a vitrine." };
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Ofertas
// ----------------------------------------------------------------------------

export async function editarOfertaVitrine(_prev: VitrineFormState, formData: FormData): Promise<VitrineFormState> {
  await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Informe o título." };
  const link = lerLink(formData.get("link"), formData.get("confirmarLinkExterno") === "1");
  if ("error" in link) return { error: link.error };
  const validade = validarValidadeVitrine(String(formData.get("validade") ?? ""));
  if (!validade.ok) return { error: validade.erro };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_ofertas")
    .update({ titulo, link: link.link, validade: validade.data })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    console.error("Erro ao editar oferta da vitrine:", error);
    return { error: "Não foi possível salvar a oferta." };
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function alternarOfertaVitrine(id: string, ativo: boolean): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("vitrine_ofertas").update({ ativo }).eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("Erro ao ativar/desativar oferta da vitrine:", error);
    return { error: "Não foi possível alterar a oferta." };
  }
  revalidatePath(CAMINHO);
  return {};
}

/**
 * vitrine_excluir_oferta (security definer) checa a permissão, apaga a
 * oferta e diz o que nada mais usa no storage — inclusive considerando
 * cópias de outras filiais, que o usuário pode não enxergar. A remoção
 * usa a service role porque o arquivo pode estar na pasta de outra filial
 * (cópia publicada pelo adm) e o banco já autorizou e conferiu o uso.
 */
export async function excluirOfertaVitrine(id: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vitrine_excluir_oferta", { p_oferta_id: id });
  if (error || !data) {
    console.error("Erro ao excluir oferta da vitrine:", error);
    return { error: error?.code === "42501" ? "Sem permissão para excluir esta oferta." : "Não foi possível excluir a oferta." };
  }

  const remover = new Set(data.remover);
  const admin = createAdminClient();
  if (data.prefixo) {
    const { data: pngs, error: erroLista } = await admin.storage.from("vitrine").list(data.prefixo, { limit: 1000 });
    if (erroLista) console.error("Erro ao listar imagens da vitrine para remover:", erroLista);
    for (const png of pngs ?? []) remover.add(`${data.prefixo}/${png.name}`);
  }
  if (remover.size > 0) {
    const { error: erroRemocao } = await admin.storage.from("vitrine").remove([...remover]);
    // Falha aqui só deixa arquivo órfão no bucket — a oferta já saiu.
    if (erroRemocao) console.error("Erro ao remover arquivos da vitrine:", erroRemocao);
  }

  revalidatePath(CAMINHO);
  return {};
}

/** URL assinada curta para baixar o PNG da oferta ou o PDF da vitrine (RLS do bucket). */
export async function urlArquivoVitrine(caminho: string, nomeDownload?: string): Promise<{ url?: string; error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("vitrine")
    .createSignedUrl(caminho, 300, nomeDownload ? { download: nomeDownload } : undefined);
  if (error || !data) {
    console.error("Erro ao gerar link da vitrine:", error);
    return { error: "Não foi possível gerar o link." };
  }
  return { url: data.signedUrl };
}
