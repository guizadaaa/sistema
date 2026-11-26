// Tipo (MIME) de um anexo a partir do nome e do MIME que o navegador mandou.
// Puro: usado no navegador (validação imediata) e no servidor (a validação
// que vale, em lib/casos/anexos.ts).

import { ANEXO_EXTENSOES_HTML, ANEXO_MIME_TYPES } from "@/lib/validation/caso";

export function ehNomeHtml(nome: string | null | undefined): boolean {
  const n = (nome ?? "").toLowerCase().trim();
  return ANEXO_EXTENSOES_HTML.some((ext) => n.endsWith(ext));
}

/**
 * MIME a gravar, ou null se o arquivo não é aceito.
 * - .html/.htm com text/html, vazio ou application/octet-stream → text/html;
 * - text/html sem extensão .html/.htm → recusado (não dá para saber o que é);
 * - PDF/JPG/PNG/WebP pelo MIME, como antes.
 */
export function mimeDoAnexo(nome: string, mime: string | null | undefined): string | null {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (ehNomeHtml(nome)) return m === "" || m === "application/octet-stream" || m === "text/html" ? "text/html" : null;
  if (m === "text/html") return null;
  return (ANEXO_MIME_TYPES as readonly string[]).includes(m) ? m : null;
}

/** Tipo para o ícone/ação da lista de anexos (a tabela guarda só o nome do arquivo). */
export function tipoVisualAnexo(nome: string | null | undefined): "html" | "pdf" | "imagem" | "outro" {
  const n = (nome ?? "").toLowerCase();
  if (ehNomeHtml(n)) return "html";
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|webp)$/.test(n)) return "imagem";
  return "outro";
}
