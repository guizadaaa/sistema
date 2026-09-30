import type { TipoMaterialApoio } from "@/lib/supabase/types";

export type TipoArquivoMaterialApoio = Exclude<TipoMaterialApoio, "link">;

/** Mesma lista do allowed_mime_types do bucket materiais-apoio (migration 20260930000001). */
export const MATERIAL_APOIO_MIME_POR_TIPO: Record<TipoArquivoMaterialApoio, readonly string[]> = {
  pdf: ["application/pdf"],
  imagem: ["image/jpeg", "image/png"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

export const MATERIAL_APOIO_EXTENSOES_POR_TIPO: Record<TipoArquivoMaterialApoio, string> = {
  pdf: ".pdf",
  imagem: ".jpg,.jpeg,.png",
  docx: ".docx",
  xlsx: ".xlsx",
};

export const TIPOS_ARQUIVO_MATERIAL_APOIO = ["pdf", "imagem", "docx", "xlsx"] as const satisfies readonly TipoArquivoMaterialApoio[];

export const TIPO_MATERIAL_APOIO_LABELS: Record<TipoMaterialApoio, string> = {
  pdf: "PDF",
  imagem: "Imagem",
  docx: "Word",
  xlsx: "Excel",
  link: "Link",
};

export const MATERIAL_APOIO_TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB — mesmo limite do bucket

export function ehTipoArquivoMaterialApoio(valor: unknown): valor is TipoArquivoMaterialApoio {
  return (TIPOS_ARQUIVO_MATERIAL_APOIO as readonly unknown[]).includes(valor);
}

/** Retorna a mensagem de erro, ou undefined se o arquivo serve para o tipo. */
export function validarArquivoMaterialApoio(tipo: TipoArquivoMaterialApoio, arquivo: { type: string; size: number }): string | undefined {
  if (arquivo.size === 0) return "Selecione um arquivo.";
  if (!MATERIAL_APOIO_MIME_POR_TIPO[tipo].includes(arquivo.type)) {
    return `Formato não permitido para o tipo ${TIPO_MATERIAL_APOIO_LABELS[tipo]} (aceito: ${MATERIAL_APOIO_EXTENSOES_POR_TIPO[tipo]}).`;
  }
  if (arquivo.size > MATERIAL_APOIO_TAMANHO_MAXIMO_BYTES) return "Arquivo maior que 10 MB.";
  return undefined;
}

/**
 * Só http(s) — a url vira href na lista, e o banco também recusa qualquer
 * outro esquema (constraint materiais_apoio_url_http).
 */
export function normalizarUrlMaterialApoio(bruta: string): string | undefined {
  const texto = bruta.trim();
  if (!texto) return undefined;
  try {
    const url = new URL(texto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
