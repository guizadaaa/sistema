import "server-only";

import ExcelJS from "exceljs";

import { formatarDias } from "@/lib/formatacao";
import { FILIAL_LABELS, QUEM_PAGA_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { STATUS_ORDEM, type MetricasPainel } from "@/lib/painel/metricas";
import { TIPOS_CASO } from "@/lib/validation/caso";

const STATUS_MARCOS = STATUS_ORDEM.filter((s) => s !== "inicial");

function cabecalho(sheet: ExcelJS.Worksheet, colunas: string[]) {
  sheet.addRow(colunas);
  sheet.getRow(sheet.rowCount).font = { bold: true };
}

export async function gerarPainelExcel(metricas: MetricasPainel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema CVC";
  workbook.created = new Date();

  const resumo = workbook.addWorksheet("Resumo");
  cabecalho(resumo, ["Métrica", "Valor"]);
  resumo.addRow(["Total de protocolos", metricas.total]);
  resumo.addRow(["Prazo vencido", metricas.prazoVencidos]);
  resumo.addRow(["Vencendo em breve", metricas.prazoVencendo]);
  resumo.addRow(["Multa total", metricas.multaTotal]);
  resumo.addRow(["Taxas de remarcação", metricas.taxasRemarcacao.taxas]);
  resumo.addRow(["Diferença tarifária", metricas.taxasRemarcacao.diferencaTarifaria]);
  resumo.columns = [{ width: 32 }, { width: 20 }];

  const porStatus = workbook.addWorksheet("Casos por status");
  cabecalho(porStatus, ["Status", "Quantidade"]);
  for (const status of STATUS_ORDEM) {
    porStatus.addRow([STATUS_LABELS[status], metricas.porStatus[status]]);
  }
  porStatus.columns = [{ width: 28 }, { width: 16 }];

  const porTipo = workbook.addWorksheet("Tipos de caso");
  cabecalho(porTipo, ["Tipo", "Quantidade"]);
  for (const tipo of TIPOS_CASO) {
    porTipo.addRow([TIPO_CASO_LABELS[tipo], metricas.porTipo[tipo]]);
  }
  porTipo.columns = [{ width: 28 }, { width: 16 }];

  const tempoMedio = workbook.addWorksheet("Tempo médio por etapa");
  cabecalho(tempoMedio, ["Até status", "Tempo médio (dias)"]);
  for (const status of STATUS_MARCOS) {
    tempoMedio.addRow([STATUS_LABELS[status], formatarDias(metricas.tempoMedioPorStatus[status])]);
  }
  tempoMedio.columns = [{ width: 28 }, { width: 20 }];

  if (metricas.tipoMaisComumPorFilial.length > 0) {
    const porFilial = workbook.addWorksheet("Tipo mais comum por loja");
    cabecalho(porFilial, ["Filial", "Tipo mais comum", "Quantidade"]);
    for (const f of metricas.tipoMaisComumPorFilial) {
      porFilial.addRow([FILIAL_LABELS[f.filial], TIPO_CASO_LABELS[f.tipo], f.quantidade]);
    }
    porFilial.columns = [{ width: 16 }, { width: 28 }, { width: 16 }];
  }

  if (metricas.tipoMaisComumPorVendedor.length > 0) {
    const porVendedor = workbook.addWorksheet("Tipo mais comum por vendedor");
    cabecalho(porVendedor, ["Vendedor", "Tipo mais comum", "Total de casos"]);
    for (const v of metricas.tipoMaisComumPorVendedor) {
      porVendedor.addRow([v.vendedorNome, TIPO_CASO_LABELS[v.tipo], v.totalCasos]);
    }
    porVendedor.columns = [{ width: 28 }, { width: 28 }, { width: 16 }];
  }

  if (metricas.casosAtencaoPrazo.length > 0) {
    const atencao = workbook.addWorksheet("Casos que precisam de atenção");
    cabecalho(atencao, ["Protocolo", "Cliente", "Vendedor", "Prazo de vigência", "Situação"]);
    for (const c of metricas.casosAtencaoPrazo) {
      atencao.addRow([c.protocolo, c.clienteNome, c.vendedorNome, c.prazoVigencia, c.situacao]);
    }
    atencao.columns = [{ width: 12 }, { width: 28 }, { width: 24 }, { width: 18 }, { width: 12 }];
  }

  const multaPorQuemPaga = workbook.addWorksheet("Multa por quem paga");
  cabecalho(multaPorQuemPaga, ["Quem paga", "Valor"]);
  for (const quemPaga of Object.keys(metricas.multaPorQuemPaga) as (keyof typeof metricas.multaPorQuemPaga)[]) {
    multaPorQuemPaga.addRow([QUEM_PAGA_LABELS[quemPaga], metricas.multaPorQuemPaga[quemPaga]]);
  }
  multaPorQuemPaga.columns = [{ width: 20 }, { width: 16 }];

  // exceljs empacota seu próprio `declare global interface Buffer extends
  // ArrayBuffer {}` (node_modules/exceljs/index.d.ts) — um shim incompatível
  // com o Buffer de @types/node que faz merge com o global e quebra a
  // inferência de tipo aqui (bug conhecido dos tipos do pacote, não do
  // runtime — writeBuffer() devolve um Buffer de Node de verdade). Cast
  // isolado nesta única linha em vez de perseguir o tipo "certo".
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}
