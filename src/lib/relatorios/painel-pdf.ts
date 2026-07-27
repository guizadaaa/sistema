import "server-only";

import { formatarDias, formatarMoeda } from "@/lib/formatacao";
import { FILIAL_LABELS, QUEM_PAGA_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { STATUS_ORDEM, type MetricasPainel } from "@/lib/painel/metricas";
import { TIPOS_CASO } from "@/lib/validation/caso";

import { badgeInline, gerarPdfBuffer, linhaChaveValor, secaoRelatorio, tabelaRelatorio, tituloRelatorio } from "./pdf-util";
import { PRAZO_INK_HEX, REPORT_COLORS, STATUS_HEX } from "./report-style";

const STATUS_MARCOS = STATUS_ORDEM.filter((s) => s !== "inicial");

export type ResumoFiltrosPainel = {
  filial?: string;
  vendedorNome?: string;
  dataInicio?: string;
  dataFim?: string;
};

function descreverFiltros(filtros: ResumoFiltrosPainel): string {
  const partes: string[] = [];
  partes.push(filtros.filial ? `Filial: ${filtros.filial}` : "Todas as filiais");
  if (filtros.vendedorNome) partes.push(`Vendedor: ${filtros.vendedorNome}`);
  if (filtros.dataInicio || filtros.dataFim) {
    partes.push(`Período: ${filtros.dataInicio ?? "início"} a ${filtros.dataFim ?? "hoje"}`);
  }
  return partes.join(" · ");
}

export async function gerarPainelPdf(metricas: MetricasPainel, filtros: ResumoFiltrosPainel): Promise<Buffer> {
  return gerarPdfBuffer((doc) => {
    tituloRelatorio(doc, "Painel de Gestão", descreverFiltros(filtros));

    secaoRelatorio(doc, "Resumo");
    linhaChaveValor(doc, "Total de protocolos", String(metricas.total));
    linhaChaveValor(doc, "Prazo vencido", String(metricas.prazoVencidos));
    linhaChaveValor(doc, "Vencendo em breve", String(metricas.prazoVencendo));

    secaoRelatorio(doc, "Casos por status");
    for (const status of STATUS_ORDEM) {
      const x0 = doc.x;
      const y = doc.y;
      badgeInline(doc, x0, y, STATUS_LABELS[status], STATUS_HEX[status].bg, STATUS_HEX[status].ink);
      doc.font("Helvetica").fontSize(10).fillColor(REPORT_COLORS.foreground);
      doc.text(String(metricas.porStatus[status]), x0 + 240, y + 3, { lineBreak: false });
      doc.x = x0;
      doc.y = y + 20;
    }

    secaoRelatorio(doc, "Tipos de caso mais comuns");
    for (const tipo of TIPOS_CASO) {
      linhaChaveValor(doc, TIPO_CASO_LABELS[tipo], String(metricas.porTipo[tipo]));
    }

    secaoRelatorio(doc, "Tempo médio por etapa");
    for (const status of STATUS_MARCOS) {
      linhaChaveValor(doc, `Até ${STATUS_LABELS[status]}`, formatarDias(metricas.tempoMedioPorStatus[status]));
    }

    secaoRelatorio(doc, "Multa total");
    linhaChaveValor(doc, "Total", formatarMoeda(metricas.multaTotal));
    for (const quemPaga of Object.keys(metricas.multaPorQuemPaga) as (keyof typeof metricas.multaPorQuemPaga)[]) {
      linhaChaveValor(doc, `Paga pelo ${QUEM_PAGA_LABELS[quemPaga].toLowerCase()}`, formatarMoeda(metricas.multaPorQuemPaga[quemPaga]));
    }

    secaoRelatorio(doc, "Taxas de remarcação");
    linhaChaveValor(doc, "Taxas", formatarMoeda(metricas.taxasRemarcacao.taxas));
    linhaChaveValor(doc, "Diferença tarifária", formatarMoeda(metricas.taxasRemarcacao.diferencaTarifaria));

    if (metricas.tipoMaisComumPorFilial.length > 0) {
      secaoRelatorio(doc, "Tipo mais comum por loja");
      tabelaRelatorio(
        doc,
        [
          { titulo: "Filial", largura: 140 },
          { titulo: "Tipo mais comum", largura: 220 },
          { titulo: "Quantidade", largura: 115 },
        ],
        metricas.tipoMaisComumPorFilial.map((f) => [FILIAL_LABELS[f.filial], TIPO_CASO_LABELS[f.tipo], String(f.quantidade)])
      );
    }

    if (metricas.casosAtencaoPrazo.length > 0) {
      secaoRelatorio(doc, "Casos que precisam de atenção");
      tabelaRelatorio(
        doc,
        [
          { titulo: "Protocolo", largura: 65 },
          { titulo: "Cliente", largura: 130 },
          { titulo: "Vendedor", largura: 120 },
          { titulo: "Prazo de vigência", largura: 80 },
          { titulo: "Situação", largura: 80 },
        ],
        metricas.casosAtencaoPrazo.map((c) => [
          `#${c.protocolo}`,
          c.clienteNome,
          c.vendedorNome,
          c.prazoVigencia,
          c.situacao,
        ]),
        (doc, colIdx, linha, x, y) => {
          if (colIdx !== 4) return false;
          const situacao = linha[4] as "vencido" | "vencendo";
          doc.font("Helvetica-Bold").fontSize(9).fillColor(PRAZO_INK_HEX[situacao]);
          doc.text(situacao === "vencido" ? "Vencido" : "Vencendo", x, y, { lineBreak: false });
          doc.fillColor(REPORT_COLORS.foreground);
          return true;
        }
      );
    }
  });
}
