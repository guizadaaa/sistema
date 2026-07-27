import "server-only";

import { formatarDataBr, formatarMoeda } from "@/lib/formatacao";
import { STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";

import type { ExtratoVendedor } from "./extrato-vendedor";
import { badgeInline, gerarPdfBuffer, linhaChaveValor, secaoRelatorio, tabelaRelatorio, tituloRelatorio } from "./pdf-util";
import { PRAZO_INK_HEX, REPORT_COLORS, STATUS_HEX } from "./report-style";

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
      doc.font("Helvetica").fontSize(10).fillColor(REPORT_COLORS.mutedForeground).text("Nenhum caso encontrado.");
      return;
    }

    tabelaRelatorio(
      doc,
      [
        { titulo: "Protocolo", largura: 55 },
        { titulo: "Cliente", largura: 115 },
        { titulo: "Tipo", largura: 95 },
        { titulo: "Status", largura: 95 },
        { titulo: "Prazo", largura: 60 },
        { titulo: "Situação", largura: 45 },
        { titulo: "Multa", largura: 55 },
      ],
      extrato.casos.map((caso) => [
        `#${caso.protocolo}`,
        caso.clienteNome,
        TIPO_CASO_LABELS[caso.tipoCaso],
        caso.statusAtual,
        formatarDataBr(caso.prazoVigencia),
        caso.situacaoPrazo,
        formatarMoeda(caso.multaTotal),
      ]),
      (doc, colIdx, linha, x, y) => {
        if (colIdx === 3) {
          const status = linha[3] as ExtratoVendedor["casos"][number]["statusAtual"];
          badgeInline(doc, x, y - 2, STATUS_LABELS[status], STATUS_HEX[status].bg, STATUS_HEX[status].ink);
          return true;
        }
        if (colIdx === 5) {
          const situacao = linha[5] as ExtratoVendedor["casos"][number]["situacaoPrazo"];
          doc.font("Helvetica-Bold").fontSize(9).fillColor(PRAZO_INK_HEX[situacao]);
          doc.text(SITUACAO_PRAZO_LABELS[situacao], x, y, { lineBreak: false });
          doc.fillColor(REPORT_COLORS.foreground);
          return true;
        }
        return false;
      }
    );
  });
}
