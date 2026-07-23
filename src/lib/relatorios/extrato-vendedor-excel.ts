import "server-only";

import ExcelJS from "exceljs";

import { STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";

import type { ExtratoVendedor } from "./extrato-vendedor";

const SITUACAO_PRAZO_LABELS: Record<ExtratoVendedor["casos"][number]["situacaoPrazo"], string> = {
  vencido: "Vencido",
  vencendo: "Vencendo",
  normal: "Em dia",
};

function cabecalho(sheet: ExcelJS.Worksheet, colunas: string[]) {
  sheet.addRow(colunas);
  sheet.getRow(sheet.rowCount).font = { bold: true };
}

/** Mesmos dados do extrato em PDF (gerarExtratoVendedorPdf), em Excel. */
export async function gerarExtratoVendedorExcel(extrato: ExtratoVendedor): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema CVC";
  workbook.created = new Date();

  const resumo = workbook.addWorksheet("Resumo");
  cabecalho(resumo, ["Métrica", "Valor"]);
  resumo.addRow(["Vendedor", extrato.vendedorNome]);
  resumo.addRow(["Total de casos", extrato.totalCasos]);
  resumo.addRow(["Multa total (todos os casos)", extrato.multaTotalGeral]);
  resumo.addRow(["Prazos vencidos", extrato.prazosVencidos]);
  resumo.addRow(["Prazos vencendo em breve", extrato.prazosVencendo]);
  resumo.columns = [{ width: 32 }, { width: 24 }];

  const casos = workbook.addWorksheet("Casos");
  cabecalho(casos, ["Protocolo", "Cliente", "Tipo", "Status", "Prazo de vigência", "Situação do prazo", "Multa total"]);
  for (const c of extrato.casos) {
    casos.addRow([
      c.protocolo,
      c.clienteNome,
      TIPO_CASO_LABELS[c.tipoCaso],
      STATUS_LABELS[c.statusAtual],
      c.prazoVigencia,
      SITUACAO_PRAZO_LABELS[c.situacaoPrazo],
      c.multaTotal,
    ]);
  }
  casos.columns = [{ width: 12 }, { width: 28 }, { width: 26 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 14 }];

  // Mesmo bug de tipos do exceljs contornado em painel-excel.ts (o pacote
  // empacota seu próprio `declare global interface Buffer extends
  // ArrayBuffer {}`, incompatível com o Buffer de @types/node).
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}
