import "server-only";

import { randomUUID } from "node:crypto";

import type { createClient } from "@/lib/supabase/server";
import {
  ANEXO_CACHE_CONTROL_S,
  ANEXO_MIME_TYPES,
  ANEXO_TAMANHO_MAXIMO_BYTES,
  ANEXO_TIPOS_DOCUMENTO,
  DESCRICAO_IMAGEM_MIME_TYPES,
  DESCRICAO_IMAGENS_MAXIMO,
} from "@/lib/validation/caso";
import type { TipoDocumentoAnexo } from "@/lib/supabase/types";

export function isTipoDocumentoAnexo(valor: string): valor is TipoDocumentoAnexo {
  return (ANEXO_TIPOS_DOCUMENTO as readonly string[]).includes(valor);
}

/**
 * Upload é melhor-esforço: uma falha em um arquivo vira um aviso não-fatal
 * em vez de reverter o que já foi feito (criação do caso, ou os outros
 * anexos da mesma leva) — anexo é sempre opcional e pode ser reenviado
 * depois, na tela de detalhe do caso (seção 6).
 *
 * Lê os arquivos de formData.getAll("anexoArquivo") e os tipos pareados de
 * formData.getAll("anexoTipo"), na mesma ordem em que os campos aparecem no
 * formulário (convenção compartilhada com os componentes de upload).
 */
export async function validarEEnviarAnexos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  formData: FormData
): Promise<string[]> {
  // Pareia arquivo e tipo pela posição ANTES de descartar as linhas vazias —
  // uma linha sem arquivo no meio não pode deslocar o tipo das seguintes.
  const tipos = formData.getAll("anexoTipo").map(String);
  const pares = formData
    .getAll("anexoArquivo")
    .map((v, i) => ({ arquivo: v, tipoBruto: tipos[i] }))
    .filter((p): p is { arquivo: File; tipoBruto: string } => p.arquivo instanceof File && p.arquivo.size > 0);

  const avisos: string[] = [];

  for (const { arquivo, tipoBruto } of pares) {

    if (!tipoBruto || !isTipoDocumentoAnexo(tipoBruto)) {
      avisos.push(`${arquivo.name}: tipo de documento inválido, não enviado.`);
      continue;
    }

    if (!(ANEXO_MIME_TYPES as readonly string[]).includes(arquivo.type)) {
      avisos.push(`${arquivo.name}: formato não permitido (só PDF, JPG, PNG ou WebP).`);
      continue;
    }

    if (arquivo.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
      avisos.push(`${arquivo.name}: maior que 10 MB, não enviado.`);
      continue;
    }

    const storagePath = `${casoId}/${randomUUID()}-${arquivo.name}`;

    // Path único por envio (randomUUID): pode ficar em cache por 1 ano.
    const { error: uploadError } = await supabase.storage.from("anexos").upload(storagePath, arquivo, {
      contentType: arquivo.type,
      cacheControl: ANEXO_CACHE_CONTROL_S,
    });

    if (uploadError) {
      console.error("Erro ao enviar anexo:", uploadError);
      avisos.push(`${arquivo.name}: falha no envio, tente novamente na tela do caso.`);
      continue;
    }

    const { error: insertError } = await supabase.from("anexos").insert({
      caso_id: casoId,
      tipo_documento: tipoBruto,
      storage_path: storagePath,
      nome_arquivo: arquivo.name,
    });

    if (insertError) {
      console.error("Erro ao registrar anexo:", insertError);
      avisos.push(`${arquivo.name}: enviado mas não registrado, tente novamente na tela do caso.`);
    }
  }

  return avisos;
}

/**
 * Imagens coladas na Descrição (formData.getAll("descricaoImagem")). Viram
 * anexos com tipo_documento "imagem_descricao" no mesmo bucket e na mesma
 * convenção de path dos anexos — herdam RLS, Storage, auditoria e retenção
 * (ver 20261006000001). Mesmo melhor-esforço de validarEEnviarAnexos: falha
 * numa imagem vira aviso, o caso já criado não é desfeito.
 */
export async function enviarImagensDescricao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  formData: FormData
): Promise<string[]> {
  const imagens = formData.getAll("descricaoImagem").filter((v): v is File => v instanceof File && v.size > 0);
  const avisos: string[] = [];

  if (imagens.length > DESCRICAO_IMAGENS_MAXIMO) {
    avisos.push(`Só as ${DESCRICAO_IMAGENS_MAXIMO} primeiras imagens da descrição foram enviadas.`);
  }

  for (const imagem of imagens.slice(0, DESCRICAO_IMAGENS_MAXIMO)) {
    if (!(DESCRICAO_IMAGEM_MIME_TYPES as readonly string[]).includes(imagem.type)) {
      avisos.push(`${imagem.name}: só imagens JPG, PNG ou WebP na descrição, não enviada.`);
      continue;
    }
    if (imagem.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
      avisos.push(`${imagem.name}: maior que 10 MB, não enviada.`);
      continue;
    }

    const storagePath = `${casoId}/${randomUUID()}-${imagem.name}`;
    const { error: uploadError } = await supabase.storage
      .from("anexos")
      .upload(storagePath, imagem, { contentType: imagem.type, cacheControl: ANEXO_CACHE_CONTROL_S });
    if (uploadError) {
      console.error("Erro ao enviar imagem da descrição:", uploadError);
      avisos.push(`${imagem.name}: falha no envio da imagem da descrição.`);
      continue;
    }

    const { error: insertError } = await supabase.from("anexos").insert({
      caso_id: casoId,
      tipo_documento: "imagem_descricao",
      storage_path: storagePath,
      nome_arquivo: imagem.name,
    });
    if (insertError) {
      console.error("Erro ao registrar imagem da descrição:", insertError);
      avisos.push(`${imagem.name}: imagem enviada mas não registrada.`);
    }
  }

  return avisos;
}
