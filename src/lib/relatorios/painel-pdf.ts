import "server-only";

import { formatarDias, formatarMoeda } from "@/lib/formatacao";
import { FILIAL_LABELS, QUEM_PAGA_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { STATUS_ORDEM, type MetricasPainel } from "@/lib/painel/metricas";
import { TIPOS_CASO } from "@/lib/validation/caso";

import { gerarPdfBuffer, linhaChaveValor, secaoRelatorio, tituloRelatorio } from "./pdf-util";

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
      linhaChaveValor(doc, STATUS_LABELS[status], String(metricas.porStatus[status]));
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
      for (const f of metricas.tipoMaisComumPorFilial) {
        linhaChaveValor(doc, FILIAL_LABELS[f.filial], `${TIPO_CASO_LABELS[f.tipo]} (${f.quantidade})`);
      }
    }

    if (metricas.casosAtencaoPrazo.length > 0) {
      secaoRelatorio(doc, "Casos que precisam de atenção");
      for (const c of metricas.casosAtencaoPrazo) {
        linhaChaveValor(doc, `#${c.protocolo} — ${c.clienteNome}`, `${c.vendedorNome} · ${c.prazoVigencia}`);
      }
    }
  });
}
