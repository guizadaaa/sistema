/** Mesmo limite do bucket "vitrine" (migration 20261029000001). */
export const VITRINE_PDF_TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

/** Imagem grande de cada página (abre em nova aba / "Salvar como"): WebP, fallback JPEG. */
export const VITRINE_IMAGEM_LARGURA = 1600;
export const VITRINE_IMAGEM_QUALIDADE = 0.85;

/** Miniatura do card (~400 px na tela; 800 px para telas de alta densidade). */
export const VITRINE_MINIATURA_LARGURA = 800;
export const VITRINE_MINIATURA_QUALIDADE = 0.8;
export const VITRINE_MINIATURA_QUALIDADE_JPEG = 0.82;
/** Meta de tamanho da miniatura: acima disso, a qualidade desce até achar. */
export const VITRINE_MINIATURA_META_BYTES = 150 * 1024;

/** Cache-Control dos arquivos no Storage: 1 ano (o caminho é único por envio). */
export const VITRINE_CACHE_CONTROL_S = "31536000";

export type ResultadoLinkVitrine =
  | { ok: true; url: string | null; dominioCvc: boolean }
  | { ok: false; erro: string };

/** cvc.com.br e qualquer subdomínio (www., cruzeiros.atlas. ...). */
export function ehDominioCvc(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "cvc.com.br" || h.endsWith(".cvc.com.br");
}

/**
 * Link da oferta: vazio é permitido; preenchido, só https://. Fora de
 * cvc.com.br é aceito, mas a tela pede confirmação (dominioCvc = false) e o
 * servidor exige que ela tenha acontecido.
 */
export function validarLinkVitrine(valor: string | null | undefined): ResultadoLinkVitrine {
  const texto = (valor ?? "").trim();
  if (!texto) return { ok: true, url: null, dominioCvc: true };

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, erro: "Link inválido. Cole o endereço completo, começando com https://." };
  }
  if (url.protocol !== "https:") return { ok: false, erro: "O link precisa começar com https://." };
  return { ok: true, url: url.toString(), dominioCvc: ehDominioCvc(url.hostname) };
}

/** Validade opcional (aaaa-mm-dd). */
export function validarValidadeVitrine(valor: string | null | undefined): { ok: true; data: string | null } | { ok: false; erro: string } {
  const texto = (valor ?? "").trim();
  if (!texto) return { ok: true, data: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(Date.parse(`${texto}T00:00:00Z`))) {
    return { ok: false, erro: "Validade inválida." };
  }
  return { ok: true, data: texto };
}

/** Oferta vencida = validade antes de hoje (hoje em São Paulo, aaaa-mm-dd). */
export function ofertaVencida(validade: string | null, hoje: string): boolean {
  return validade !== null && validade < hoje;
}
