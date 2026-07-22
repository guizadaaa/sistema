import "server-only";

import PDFDocument from "pdfkit";

/** Constrói um PDF via pdfkit (stream) e devolve o Buffer final — pdfkit não tem modo síncrono. */
export function gerarPdfBuffer(desenhar: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      desenhar(doc);
      doc.end();
    } catch (erro) {
      reject(erro);
    }
  });
}

export function tituloRelatorio(doc: PDFKit.PDFDocument, titulo: string, subtitulo?: string) {
  doc.fontSize(18).text(titulo, { align: "left" });
  if (subtitulo) {
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#555555").text(subtitulo);
    doc.fillColor("#000000");
  }
  doc.moveDown(1);
}

export function secaoRelatorio(doc: PDFKit.PDFDocument, titulo: string) {
  doc.moveDown(0.5);
  doc.fontSize(13).text(titulo);
  doc.moveDown(0.3);
  doc.fontSize(10);
}

export function linhaChaveValor(doc: PDFKit.PDFDocument, chave: string, valor: string) {
  const x0 = doc.x;
  const y0 = doc.y;
  doc.fontSize(10).fillColor("#555555").text(chave, x0, y0, { width: 220 });
  doc.fillColor("#000000").text(valor, x0 + 220, y0, { width: 250 });
  doc.x = x0;
}
