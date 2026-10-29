import { VITRINE_PNG_LARGURA } from "@/lib/validation/vitrine";

import { sugerirTituloOferta, type TrechoTexto } from "./titulo";

// Só no navegador: pdf.js renderiza cada página num <canvas> e lê o texto.
// O PDF (9–14 MB) nunca passa pelo servidor do Next.

export type PaginaProcessada = {
  numero: number;
  png: Blob;
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

function canvasParaPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem da página."))), "image/png")
  );
}

/** Gera o PNG (~1600 px de largura) e o texto de cada página. */
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
      const escala = VITRINE_PNG_LARGURA / pagina.getViewport({ scale: 1 }).width;
      const viewport = pagina.getViewport({ scale: escala });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pagina.render({ canvas, viewport }).promise;
      const png = await canvasParaPng(canvas);

      // Tamanho da fonte = escala vertical da matriz do trecho (para achar as
      // "linhas com fonte grande" quando a página não tem "Valor").
      const conteudo = await pagina.getTextContent();
      const trechos: TrechoTexto[] = conteudo.items.flatMap((item) =>
        "str" in item ? [{ texto: item.str, tamanho: Math.hypot(item.transform[2], item.transform[3]), fimDeLinha: item.hasEOL }] : []
      );
      const texto = trechos.map((t) => t.texto + (t.fimDeLinha ? "\n" : " ")).join("");

      paginas.push({ numero, png, texto, tituloSugerido: sugerirTituloOferta(trechos) });
      pagina.cleanup();
      aoProgredir?.(numero, documento.numPages);
    }
    return paginas;
  } finally {
    await carregamento.destroy();
  }
}
