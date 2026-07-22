import "server-only";

import { formatarDataBr, formatarMoeda } from "@/lib/formatacao";
import { STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";

import type { ExtratoVendedor } from "./extrato-vendedor";
import { gerarPdfBuffer, linhaChaveValor, secaoRelatorio, tituloRelatorio } from "./pdf-util";

const SITUACAO_PRAZO_LABELS: Record<ExtratoVendedor["casos"][number]["situacaoPrazo"], string> = {
  vencido: "Vencido",
  vencendo: "Vencendo",
  normal: "Em dia",
};

export async function gerarExtratoVendedorPdf(extrato: ExtratoVendedor): Promise<Buffer> {
  return gerarPdfBuffer((doc) => {
    tituloRelatorio(
      doc,
      `Extrato — ${extrato.vendedorNome}`,
      `Gerado em ${formatarDataBr(extrato.geradoEm.slice(0, 10))} · Uso interno, reunião de performance`
    );

    secaoRelatorio(doc, "Resumo");
    linhaChaveValor(doc, "Total de casos", String(extrato.totalCasos));
    linhaChaveValor(doc, "Multa total (todos os casos)", formatarMoeda(extrato.multaTotalGeral));
    linhaChaveValor(doc, "Prazos vencidos", String(extrato.prazosVencidos));
    linhaChaveValor(doc, "Prazos vencendo em breve", String(extrato.prazosVencendo));

    secaoRelatorio(doc, "Casos");
    if (extrato.casos.length === 0) {
      doc.fontSize(10).text("Nenhum caso encontrado.");
      return;
    }

    for (const caso of extrato.casos) {
      linhaChaveValor(
        doc,
        `#${caso.protocolo} — ${caso.clienteNome}`,
        `${TIPO_CASO_LABELS[caso.tipoCaso]} · ${STATUS_LABELS[caso.statusAtual]}`
      );
      linhaChaveValor(
        doc,
        `Prazo: ${formatarDataBr(caso.prazoVigencia)} (${SITUACAO_PRAZO_LABELS[caso.situacaoPrazo]})`,
        `Multa: ${formatarMoeda(caso.multaTotal)}`
      );
      doc.moveDown(0.3);
    }
  });
}
