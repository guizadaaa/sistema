import "server-only";

import PDFDocument from "pdfkit";

import { REPORT_COLORS } from "./report-style";

const MARGEM = 40;
const FAIXA_ALTURA = 56;

/**
 * `doc.text(texto, x, y, { width, lineBreak: false })` quebra linha mesmo
 * assim quando o texto excede `width` (comportamento observado do pdfkit,
 * não documentado — lineBreak:false só evita o wrap quando `width` não é
 * passado). Truncar manualmente antes de desenhar evita tanto o wrap feio
 * quanto o texto vazando sem controle sobre a coluna vizinha.
 */
function truncarTexto(doc: PDFKit.PDFDocument, texto: string, larguraMax: number): string {
  if (doc.widthOfString(texto) <= larguraMax) return texto;
  let truncado = texto;
  while (truncado.length > 1 && doc.widthOfString(`${truncado}…`) > larguraMax) {
    truncado = truncado.slice(0, -1);
  }
  return `${truncado}…`;
}

/** Constrói um PDF via pdfkit (stream) e devolve o Buffer final — pdfkit não tem modo síncrono. */
export function gerarPdfBuffer(desenhar: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEM, size: "A4" });
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

/**
 * Faixa colorida no topo da primeira página — "CVC" como wordmark (não há
 * nenhum arquivo de logo no projeto; ver relatorios.test.ts e a conversa que
 * introduziu esta paleta) + título do relatório, ambos em branco sobre o
 * accent. Só aparece uma vez, mesmo em relatórios com múltiplas páginas.
 */
export function tituloRelatorio(doc: PDFKit.PDFDocument, titulo: string, subtitulo?: string) {
  const largura = doc.page.width;

  doc.rect(0, 0, largura, FAIXA_ALTURA).fill(REPORT_COLORS.accent);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(REPORT_COLORS.headerText)
    .text("CVC", MARGEM, 16, { continued: false });

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(REPORT_COLORS.headerText)
    .text(titulo, MARGEM, 32);

  doc.y = FAIXA_ALTURA + 14;
  doc.x = MARGEM;

  if (subtitulo) {
    doc.font("Helvetica").fontSize(9).fillColor(REPORT_COLORS.mutedForeground).text(subtitulo, MARGEM);
    doc.moveDown(0.4);
  }

  doc.fillColor(REPORT_COLORS.foreground);
  doc.moveDown(0.6);
}

export function secaoRelatorio(doc: PDFKit.PDFDocument, titulo: string) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(REPORT_COLORS.accent).text(titulo, MARGEM, y);
  const yLinha = doc.y + 2;
  doc
    .moveTo(MARGEM, yLinha)
    .lineTo(doc.page.width - doc.page.margins.right, yLinha)
    .lineWidth(0.75)
    .strokeColor(REPORT_COLORS.border)
    .stroke();
  doc.y = yLinha + 8;
  doc.x = MARGEM;
  doc.font("Helvetica").fontSize(10).fillColor(REPORT_COLORS.foreground);
}

export function linhaChaveValor(doc: PDFKit.PDFDocument, chave: string, valor: string) {
  const x0 = doc.x;
  const y0 = doc.y;
  doc.font("Helvetica").fontSize(10).fillColor(REPORT_COLORS.mutedForeground).text(chave, x0, y0, { width: 220 });
  doc.fillColor(REPORT_COLORS.foreground).text(valor, x0 + 220, y0, { width: 250 });
  doc.x = x0;
  doc.fillColor(REPORT_COLORS.foreground);
}

/** Badge de status "inline" — mesmo tratamento visual do STATUS_BADGE_CLASSES da tela (fundo suave + texto na cor "-ink"). */
export function badgeInline(doc: PDFKit.PDFDocument, x: number, y: number, texto: string, bg: string, ink: string): number {
  doc.font("Helvetica-Bold").fontSize(8);
  const largura = doc.widthOfString(texto) + 12;
  const altura = 14;
  doc.roundedRect(x, y, largura, altura, 3).fill(bg);
  doc.fillColor(ink).text(texto, x + 6, y + 3.5, { lineBreak: false });
  doc.fillColor(REPORT_COLORS.foreground);
  return largura;
}

export type ColunaTabela = { titulo: string; largura: number };

/**
 * Tabela genérica: cabeçalho com fundo accent (texto branco) + linhas com
 * zebra striping leve, cuidando de quebra de página (redesenha o cabeçalho
 * na página seguinte quando o conteúdo não cabe). `renderizarCelula`
 * opcional troca o texto simples por algo customizado (ex.: badge de
 * status) numa coluna específica — recebe o índice da coluna e da linha.
 */
export function tabelaRelatorio(
  doc: PDFKit.PDFDocument,
  colunas: ColunaTabela[],
  linhas: string[][],
  renderizarCelula?: (doc: PDFKit.PDFDocument, colIdx: number, linha: string[], x: number, y: number, largura: number) => boolean
) {
  const ALTURA_LINHA = 20;
  const ALTURA_CABECALHO = 20;
  const xInicial = MARGEM;
  const yLimite = doc.page.height - doc.page.margins.bottom;

  function desenharCabecalho() {
    const y = doc.y;
    doc.rect(xInicial, y, larguraTotal, ALTURA_CABECALHO).fill(REPORT_COLORS.accent);
    let x = xInicial;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(REPORT_COLORS.headerText);
    for (const coluna of colunas) {
      doc.text(truncarTexto(doc, coluna.titulo, coluna.largura - 8), x + 6, y + 6, { lineBreak: false });
      x += coluna.largura;
    }
    doc.y = y + ALTURA_CABECALHO;
    doc.fillColor(REPORT_COLORS.foreground);
  }

  const larguraTotal = colunas.reduce((soma, c) => soma + c.largura, 0);

  desenharCabecalho();

  linhas.forEach((linha, idx) => {
    if (doc.y + ALTURA_LINHA > yLimite) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      desenharCabecalho();
    }

    const y = doc.y;
    if (idx % 2 === 1) {
      doc.rect(xInicial, y, larguraTotal, ALTURA_LINHA).fill("#fafafa");
    }

    let x = xInicial;
    doc.font("Helvetica").fontSize(9).fillColor(REPORT_COLORS.foreground);
    linha.forEach((valor, colIdx) => {
      const largura = colunas[colIdx].largura;
      const customizado = renderizarCelula?.(doc, colIdx, linha, x + 6, y + 4, largura - 8);
      if (!customizado) {
        doc.fillColor(REPORT_COLORS.foreground);
        doc.text(truncarTexto(doc, valor, largura - 8), x + 6, y + 5, { lineBreak: false });
      }
      x += largura;
    });

    doc
      .moveTo(xInicial, y + ALTURA_LINHA)
      .lineTo(xInicial + larguraTotal, y + ALTURA_LINHA)
      .lineWidth(0.5)
      .strokeColor(REPORT_COLORS.border)
      .stroke();

    doc.y = y + ALTURA_LINHA;
  });

  doc.x = MARGEM;
  doc.fillColor(REPORT_COLORS.foreground);
}
