import "server-only";

import type ExcelJS from "exceljs";

import type { StatusCaso } from "@/lib/supabase/types";

import { argb, PRAZO_INK_HEX, REPORT_COLORS, STATUS_HEX, type SituacaoPrazo } from "./report-style";

/** Título do relatório em destaque, mesclado na largura da tabela — mesmo accent do PDF. */
export function tituloSheet(sheet: ExcelJS.Worksheet, titulo: string, colunas: number) {
  sheet.mergeCells(1, 1, 1, Math.max(colunas, 1));
  const cell = sheet.getCell(1, 1);
  cell.value = titulo;
  cell.font = { bold: true, size: 13, color: { argb: argb(REPORT_COLORS.accent) } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 22;
}

/** Cabeçalho de tabela com o mesmo tratamento visual do PDF (fundo accent, texto branco em negrito). */
export function cabecalho(sheet: ExcelJS.Worksheet, colunas: string[]) {
  const row = sheet.addRow(colunas);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: argb(REPORT_COLORS.headerText) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(REPORT_COLORS.accent) } };
  });
}

/** Mesmo badge da tela (STATUS_BADGE_CLASSES): fundo suave na cor do status + texto "-ink" em negrito. */
export function celulaStatus(cell: ExcelJS.Cell, status: StatusCaso, label: string) {
  cell.value = label;
  const { bg, ink } = STATUS_HEX[status];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(bg) } };
  cell.font = { bold: true, color: { argb: argb(ink) } };
}

/** Mesmo tratamento de PRAZO_COR_TEXT_CLASSES: só texto colorido, sem preenchimento de fundo. */
export function celulaPrazo(cell: ExcelJS.Cell, situacao: SituacaoPrazo, label: string) {
  cell.value = label;
  cell.font = { bold: true, color: { argb: argb(PRAZO_INK_HEX[situacao]) } };
}
