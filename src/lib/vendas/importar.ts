import "server-only";

import ExcelJS from "exceljs";

import type { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type ResultadoImportacaoVendas = {
  novas: number;
  atualizadas: number;
  /** Uma mensagem por linha COM Venda Nº que não pôde ser importada (ex. "Linha 12: sem Vendedor — ignorada."). */
  avisos: string[];
};

/**
 * Erro com mensagem já escrita pra humanos (formato do arquivo, arquivo
 * ilegível, falha ao gravar no banco) — a action repassa `message` direto
 * pra UI em vez de um genérico que esconde a causa real.
 */
export class ErroImportacaoVendas extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = "ErroImportacaoVendas";
  }
}

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
 * Venda Nº) — por isso a leitura é por NOME de coluna (não posição fixa).
 * Linha sem Venda Nº é rodapé/linha em branco (sempre silenciosa); linha COM
 * Venda Nº mas com outro campo faltando é erro real de dado e vira aviso
 * específico daquela linha (ver lerLinhas).
 */
function localizarColunas(sheet: ExcelJS.Worksheet): Record<string, number> {
  const indice: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const nome = String(cell.value ?? "").trim();
    if (nome) indice[nome] = colNumber;
  });

  const faltando = COLUNAS_OBRIGATORIAS.filter((col) => !indice[col]);
  if (faltando.length > 0) {
    throw new ErroImportacaoVendas(`Planilha fora do formato esperado — coluna(s) não encontrada(s): ${faltando.join(", ")}.`);
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

/** Célula de fórmula chega como { formula, result } e texto formatado como { richText } — reduz ao valor em si. */
function valorCelula(valor: ExcelJS.CellValue): unknown {
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    if ("result" in valor) return valor.result;
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("text" in valor) return valor.text;
  }
  return valor;
}

function vazio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "");
}

export function lerLinhas(
  sheet: ExcelJS.Worksheet,
  colunas: Record<string, number>
): { linhas: LinhaValida[]; avisos: string[] } {
  const linhas: LinhaValida[] = [];
  const avisos: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const celula = (coluna: (typeof COLUNAS_OBRIGATORIAS)[number]) => valorCelula(row.getCell(colunas[coluna]).value);

    const vendaNumeroBruto = celula("Venda Nº");
    // Sem Venda Nº = linha de totais (rodapé) ou linha em branco — nunca um erro.
    if (vazio(vendaNumeroBruto)) continue;

    const vendedorBruto = celula("Vendedor");
    const dataBruta = celula("Data Venda");
    const paganteBruto = celula("Pagante");
    const produtoBruto = celula("Produto");
    const valorTotalBruto = celula("Valor Total");

    const vendaNumero = Number(vendaNumeroBruto);
    const dataVenda = formatarDataVenda(dataBruta);
    const valorTotal = Number(valorTotalBruto);

    const faltando: string[] = [];
    const invalidos: string[] = [];
    if (!Number.isInteger(vendaNumero)) invalidos.push("Venda Nº");
    if (vazio(vendedorBruto)) faltando.push("Vendedor");
    if (vazio(dataBruta)) faltando.push("Data Venda");
    else if (!dataVenda) invalidos.push("Data Venda");
    if (vazio(paganteBruto)) faltando.push("Pagante");
    if (vazio(produtoBruto)) faltando.push("Produto");
    if (vazio(valorTotalBruto)) faltando.push("Valor Total");
    else if (Number.isNaN(valorTotal)) invalidos.push("Valor Total");

    if (faltando.length > 0 || invalidos.length > 0) {
      const problemas = [
        ...(faltando.length > 0 ? [`sem ${faltando.join(", ")}`] : []),
        ...(invalidos.length > 0 ? [`valor inválido em ${invalidos.join(", ")}`] : []),
      ];
      avisos.push(`Linha ${r}: ${problemas.join("; ")} — ignorada.`);
      continue;
    }

    linhas.push({
      venda_numero: vendaNumero,
      vendedor_nome_planilha: String(vendedorBruto).trim(),
      data_venda: dataVenda!,
      pagante: String(paganteBruto).trim(),
      produto: String(produtoBruto).trim(),
      valor_total: valorTotal,
    });
  }

  return { linhas, avisos };
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
  try {
    await workbook.xlsx.load(arquivo);
  } catch (erro) {
    throw new ErroImportacaoVendas(
      `Não foi possível ler o arquivo como .xlsx (arquivo corrompido ou em outro formato): ${mensagemDe(erro)}`,
      { cause: erro }
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ErroImportacaoVendas("O arquivo .xlsx não tem nenhuma planilha.");

  const colunas = localizarColunas(sheet);
  const { linhas, avisos } = lerLinhas(sheet, colunas);

  if (linhas.length === 0) {
    return { novas: 0, atualizadas: 0, avisos };
  }

  const numeros = linhas.map((l) => l.venda_numero);
  const { data: existentes, error: existentesError } = await supabase
    .from("vendas_com_vendedor")
    .select("venda_numero")
    .eq("filial", filial)
    .in("venda_numero", numeros);
  if (existentesError) throw erroDeBanco("consultar as vendas já importadas", existentesError);

  const jaExistiam = new Set((existentes ?? []).map((e) => e.venda_numero));
  const atualizadas = linhas.filter((l) => jaExistiam.has(l.venda_numero)).length;
  const novas = linhas.length - atualizadas;

  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE).map((l) => ({ filial, ...l }));
    const { error } = await supabase.from("vendas_importadas").upsert(lote, { onConflict: "filial,venda_numero" });
    if (error) throw erroDeBanco("gravar as vendas", error);
  }

  return { novas, atualizadas, avisos };
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object" && "message" in erro) return String(erro.message);
  return String(erro);
}

function erroDeBanco(operacao: string, erro: unknown): ErroImportacaoVendas {
  return new ErroImportacaoVendas(
    `Erro no banco de dados ao ${operacao}: ${mensagemDe(erro)}. Reenviar o mesmo arquivo é seguro (upsert por Venda Nº, nunca duplica).`,
    { cause: erro }
  );
}
