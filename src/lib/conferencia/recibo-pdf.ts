import { hojeSaoPaulo } from "@/lib/linkly/mes";
import type { FilialCvc } from "@/lib/supabase/types";

// 4 MB: abaixo do teto de ~4,5 MB de corpo de requisição da Vercel.
export const PDF_RECIBO_MAX_BYTES = 4 * 1024 * 1024;

/** {loja}/{aaaa}/{mm}/{recibo}.pdf — aaaa/mm da data da venda (hoje, se não houver). */
export function caminhoPdfRecibo(loja: FilialCvc, dataVenda: string | null, recibo: string): string {
  const [ano, mes] = (dataVenda ?? hojeSaoPaulo()).split("-");
  return `${loja}/${ano}/${mes}/${recibo}.pdf`;
}

/** Assinatura "%PDF-" no início do arquivo. */
export function pareceSerPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}
