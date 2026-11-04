import {
  VITRINE_IMAGEM_LARGURA,
  VITRINE_IMAGEM_QUALIDADE,
  VITRINE_MINIATURA_LARGURA,
  VITRINE_MINIATURA_META_BYTES,
  VITRINE_MINIATURA_QUALIDADE,
  VITRINE_MINIATURA_QUALIDADE_JPEG,
} from "@/lib/validation/vitrine";

import { sugerirTituloOferta, type TrechoTexto } from "./titulo";

// Só no navegador: pdf.js renderiza cada página num <canvas> e lê o texto;
// o canvas vira a imagem grande e a miniatura do card (WebP, fallback JPEG).
// O PDF (9–14 MB) nunca passa pelo servidor do Next.

export type PaginaProcessada = {
  numero: number;
  /** WebP 1600 px (JPEG se o navegador não gerar WebP): abre em nova aba. */
  imagem: Blob;
  /** WebP 800 px (JPEG no fallback), ≤ ~150 KB: a que o card mostra. */
  miniatura: Blob;
  texto: string;
  tituloSugerido: string;
};

// Build "legacy": a padrão do pdf.js 6 usa APIs de JavaScript recentes demais
// (ex.: Map.getOrInsertComputed) para navegadores ainda comuns nas lojas.
async function carregarPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem da página."))), tipo, qualidade)
  );
}

/**
 * WebP na qualidade pedida; se o navegador não gera WebP (o toBlob devolve
 * PNG nesse caso), JPEG na qualidade de fallback.
 */
async function comprimir(canvas: HTMLCanvasElement, qualidadeWebp: number, qualidadeJpeg: number): Promise<Blob> {
  const webp = await canvasParaBlob(canvas, "image/webp", qualidadeWebp);
  if (webp.type === "image/webp") return webp;
  return canvasParaBlob(canvas, "image/jpeg", qualidadeJpeg);
}

/** Miniatura do card: 800 px, baixando a qualidade até caber na meta (~150 KB). */
async function gerarMiniatura(origem: HTMLCanvasElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = VITRINE_MINIATURA_LARGURA;
  canvas.height = Math.round((origem.height * VITRINE_MINIATURA_LARGURA) / origem.width);
  const contexto = canvas.getContext("2d")!;
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(origem, 0, 0, canvas.width, canvas.height);

  let miniatura = await comprimir(canvas, VITRINE_MINIATURA_QUALIDADE, VITRINE_MINIATURA_QUALIDADE_JPEG);
  for (let q = 0.7; miniatura.size > VITRINE_MINIATURA_META_BYTES && q >= 0.5; q -= 0.1) {
    miniatura = await comprimir(canvas, q, q);
  }
  return miniatura;
}

/** Gera a imagem (1600 px), a miniatura (800 px) e o texto de cada página. */
export async function processarPdfVitrine(
  arquivo: Blob,
  aoProgredir?: (feitas: number, total: number) => void
): Promise<PaginaProcessada[]> {
  const pdfjs = await carregarPdfJs();
  const carregamento = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  const documento = await carregamento.promise;

  try {
    const paginas: PaginaProcessada[] = [];
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const escala = VITRINE_IMAGEM_LARGURA / pagina.getViewport({ scale: 1 }).width;
      const viewport = pagina.getViewport({ scale: escala });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pagina.render({ canvas, viewport }).promise;
      const imagem = await comprimir(canvas, VITRINE_IMAGEM_QUALIDADE, VITRINE_IMAGEM_QUALIDADE);
      const miniatura = await gerarMiniatura(canvas);

      // Tamanho da fonte = escala vertical da matriz do trecho (para achar as
      // "linhas com fonte grande" quando a página não tem "Valor").
      const conteudo = await pagina.getTextContent();
      const trechos: TrechoTexto[] = conteudo.items.flatMap((item) =>
        "str" in item ? [{ texto: item.str, tamanho: Math.hypot(item.transform[2], item.transform[3]), fimDeLinha: item.hasEOL }] : []
      );
      const texto = trechos.map((t) => t.texto + (t.fimDeLinha ? "\n" : " ")).join("");

      paginas.push({ numero, imagem, miniatura, texto, tituloSugerido: sugerirTituloOferta(trechos) });
      pagina.cleanup();
      aoProgredir?.(numero, documento.numPages);
    }
    return paginas;
  } finally {
    await carregamento.destroy();
  }
}
