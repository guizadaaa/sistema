import "server-only";

import ExcelJS from "exceljs";

import type { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type ResultadoImportacaoVendas = {
  novas: number;
  atualizadas: number;
  ignoradas: number;
};

const COLUNAS_OBRIGATORIAS = ["Venda Nº", "Vendedor", "Data Venda", "Pagante", "Produto", "Valor Total"] as const;

type LinhaValida = {
  venda_numero: number;
  vendedor_nome_planilha: string;
  data_venda: string;
  pagante: string;
  produto: string;
  valor_total: number;
};

/**
 * A planilha da CVC traz uma coluna A em branco (dado real começa em B) e
 * sempre termina com uma linha de totais (soma de Comissão/Valor Total, sem
 * Venda Nº nem Vendedor) — por isso a leitura é por NOME de coluna (não
 * posição fixa) e qualquer linha sem Venda Nº ou Vendedor é tratada como
 * rodapé, não como erro.
 */
function localizarColunas(sheet: ExcelJS.Worksheet): Record<string, number> {
  const indice: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const nome = String(cell.value ?? "").trim();
    if (nome) indice[nome] = colNumber;
  });

  const faltando = COLUNAS_OBRIGATORIAS.filter((col) => !indice[col]);
  if (faltando.length > 0) {
    throw new Error(`Planilha fora do formato esperado — coluna(s) não encontrada(s): ${faltando.join(", ")}.`);
  }

  return indice;
}

/** exceljs entrega células de data como Date (meia-noite UTC) — converte pro formato da coluna `date`. */
function formatarDataVenda(valor: unknown): string | null {
  if (valor instanceof Date) {
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) return valor.slice(0, 10);
  return null;
}

function lerLinhas(sheet: ExcelJS.Worksheet, colunas: Record<string, number>): { linhas: LinhaValida[]; ignoradas: number } {
  const linhas: LinhaValida[] = [];
  let ignoradas = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);

    const vendaNumeroBruto = row.getCell(colunas["Venda Nº"]).value;
    const vendedorBruto = row.getCell(colunas["Vendedor"]).value;

    // Linha de totais (rodapé) ou linha em branco — nunca um erro, só ignorada.
    if (vendaNumeroBruto === null || vendaNumeroBruto === undefined || !vendedorBruto) {
      ignoradas++;
      continue;
    }

    const vendaNumero = Number(vendaNumeroBruto);
    const dataVenda = formatarDataVenda(row.getCell(colunas["Data Venda"]).value);
    const pagante = String(row.getCell(colunas["Pagante"]).value ?? "").trim();
    const produto = String(row.getCell(colunas["Produto"]).value ?? "").trim();
    const valorTotal = Number(row.getCell(colunas["Valor Total"]).value);

    if (Number.isNaN(vendaNumero) || !dataVenda || !pagante || !produto || Number.isNaN(valorTotal)) {
      ignoradas++;
      continue;
    }

    linhas.push({
      venda_numero: vendaNumero,
      vendedor_nome_planilha: String(vendedorBruto).trim(),
      data_venda: dataVenda,
      pagante,
      produto,
      valor_total: valorTotal,
    });
  }

  return { linhas, ignoradas };
}

const TAMANHO_LOTE = 500;

/**
 * Upload cumulativo: o arquivo sempre traz TODAS as vendas do dia 1 do mês
 * até a data do envio — cada chamada faz upsert por (filial, venda_numero),
 * então reenviar o mesmo arquivo (ou uma versão maior, do mesmo mês) nunca
 * duplica, só atualiza o que já existia e insere o que é novo.
 *
 * A checagem de "já existe" usa a view vendas_com_vendedor (não a tabela
 * crua — authenticated não tem SELECT direto em vendas_importadas, só
 * INSERT/UPDATE, mesmo padrão de desfechos) só pra poder relatar
 * novas/atualizadas separadamente; o upsert em si é uma chamada só.
 */
export async function importarVendasPlanilha(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filial: FilialCvc,
  arquivo: ArrayBuffer
): Promise<ResultadoImportacaoVendas> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arquivo);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia ou em formato inválido.");

  const colunas = localizarColunas(sheet);
  const { linhas, ignoradas } = lerLinhas(sheet, colunas);

  if (linhas.length === 0) {
    return { novas: 0, atualizadas: 0, ignoradas };
  }

  const numeros = linhas.map((l) => l.venda_numero);
  const { data: existentes, error: existentesError } = await supabase
    .from("vendas_com_vendedor")
    .select("venda_numero")
    .eq("filial", filial)
    .in("venda_numero", numeros);
  if (existentesError) throw existentesError;

  const jaExistiam = new Set((existentes ?? []).map((e) => e.venda_numero));
  const atualizadas = linhas.filter((l) => jaExistiam.has(l.venda_numero)).length;
  const novas = linhas.length - atualizadas;

  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE).map((l) => ({ filial, ...l }));
    const { error } = await supabase.from("vendas_importadas").upsert(lote, { onConflict: "filial,venda_numero" });
    if (error) throw error;
  }

  return { novas, atualizadas, ignoradas };
}
