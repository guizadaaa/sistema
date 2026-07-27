import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { CasoAtencaoPrazo, MetricasPainel } from "@/lib/painel/metricas";

import type { ExtratoVendedor } from "./extrato-vendedor";
import { gerarExtratoVendedorExcel } from "./extrato-vendedor-excel";
import { gerarExtratoVendedorPdf } from "./extrato-vendedor-pdf";
import { gerarPainelExcel } from "./painel-excel";
import { gerarPainelPdf } from "./painel-pdf";

const CASO_ATENCAO: CasoAtencaoPrazo = {
  id: "c1",
  protocolo: 42,
  clienteNome: "Cliente Teste",
  vendedorNome: "Vendedor Um",
  prazoVigencia: "2026-01-01",
  situacao: "vencido",
};

const METRICAS_FIXTURE: MetricasPainel = {
  total: 10,
  porStatus: { inicial: 1, recepcionado: 2, em_andamento_interno: 3, reavaliacao: 1, resolvido: 2, ouvidoria: 1 },
  porTipo: { alteracao_data: 4, cancelamento: 2, recadastro_sem_reserva: 3, inadimplencia: 1 },
  metricasTeste: null,
  tipoMaisComumPorFilial: [{ filial: "1710", tipo: "alteracao_data", quantidade: 4 }],
  tipoMaisComumPorVendedor: [{ vendedorId: "v1", vendedorNome: "Vendedor Um", tipo: "alteracao_data", totalCasos: 5 }],
  prazoVencidos: 1,
  prazoVencendo: 2,
  casosAtencaoPrazo: [CASO_ATENCAO],
  tempoMedioPorStatus: {
    inicial: null,
    recepcionado: 2.5,
    em_andamento_interno: 5,
    reavaliacao: null,
    resolvido: 10,
    ouvidoria: null,
  },
  tempoMedioPorStatusPorFilial: [],
  tempoMedioPorStatusPorVendedor: [],
  multaTotal: 1500.5,
  multaPorQuemPaga: { cliente: 1000.5, vendedor: 500 },
  taxasRemarcacao: { taxas: 200, diferencaTarifaria: 50 },
};

const METRICAS_VAZIAS: MetricasPainel = {
  ...METRICAS_FIXTURE,
  total: 0,
  porStatus: { inicial: 0, recepcionado: 0, em_andamento_interno: 0, reavaliacao: 0, resolvido: 0, ouvidoria: 0 },
  porTipo: { alteracao_data: 0, cancelamento: 0, recadastro_sem_reserva: 0, inadimplencia: 0 },
  tipoMaisComumPorFilial: [],
  tipoMaisComumPorVendedor: [],
  casosAtencaoPrazo: [],
  tempoMedioPorStatus: { inicial: null, recepcionado: null, em_andamento_interno: null, reavaliacao: null, resolvido: null, ouvidoria: null },
  multaTotal: 0,
  multaPorQuemPaga: { cliente: 0, vendedor: 0 },
  taxasRemarcacao: { taxas: 0, diferencaTarifaria: 0 },
};

function ehPdfValido(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("gerarPainelPdf", () => {
  it("gera um PDF válido e não vazio com dados", async () => {
    const buffer = await gerarPainelPdf(METRICAS_FIXTURE, { filial: "1710", vendedorNome: "Vendedor Um" });
    expect(ehPdfValido(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("não quebra com métricas zeradas (sem casos no período)", async () => {
    const buffer = await gerarPainelPdf(METRICAS_VAZIAS, {});
    expect(ehPdfValido(buffer)).toBe(true);
  });
});

describe("gerarPainelExcel", () => {
  it("gera um .xlsx com os valores agregados corretos", async () => {
    const buffer = await gerarPainelExcel(METRICAS_FIXTURE);

    const workbook = new ExcelJS.Workbook();
    // Cast por causa do shim de tipos incompatível de exceljs (ver
    // comentário em painel-excel.ts) — buffer é um Buffer de Node de
    // verdade em tempo de execução.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    // Linha 1 é o título mesclado (tituloSheet) — cabeçalho e dados deslocam uma linha.
    const resumo = workbook.getWorksheet("Resumo");
    expect(resumo).toBeDefined();
    expect(resumo?.getRow(3).getCell(2).value).toBe(10); // Total de protocolos
    expect(resumo?.getRow(5).getCell(2).value).toBe(2); // Vencendo em breve

    const porStatus = workbook.getWorksheet("Casos por status");
    expect(porStatus?.rowCount).toBe(8); // título + cabeçalho + 6 status

    const porFilial = workbook.getWorksheet("Tipo mais comum por loja");
    expect(porFilial?.getRow(3).getCell(3).value).toBe(4); // quantidade
  });

  it("não cria a aba 'por loja' quando não há recorte de filial", async () => {
    const buffer = await gerarPainelExcel(METRICAS_VAZIAS);
    const workbook = new ExcelJS.Workbook();
    // Cast por causa do shim de tipos incompatível de exceljs (ver
    // comentário em painel-excel.ts) — buffer é um Buffer de Node de
    // verdade em tempo de execução.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("Tipo mais comum por loja")).toBeUndefined();
  });
});

const EXTRATO_FIXTURE: ExtratoVendedor = {
  vendedorId: "v1",
  vendedorNome: "Vendedor Um",
  vendedorFilial: "1710",
  geradoEm: "2026-07-23T10:00:00.000Z",
  casos: [
    {
      id: "c1",
      protocolo: 42,
      tipoCaso: "alteracao_data",
      clienteNome: "Cliente Teste",
      statusAtual: "resolvido",
      prazoVigencia: "2026-01-01",
      situacaoPrazo: "vencido",
      multaTotal: 300,
    },
  ],
  totalCasos: 1,
  multaTotalGeral: 300,
  prazosVencidos: 1,
  prazosVencendo: 0,
};

describe("gerarExtratoVendedorPdf", () => {
  it("gera um PDF válido com casos", async () => {
    const buffer = await gerarExtratoVendedorPdf(EXTRATO_FIXTURE);
    expect(ehPdfValido(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(300);
  });

  it("não quebra quando o vendedor não tem nenhum caso", async () => {
    const buffer = await gerarExtratoVendedorPdf({ ...EXTRATO_FIXTURE, casos: [], totalCasos: 0, multaTotalGeral: 0 });
    expect(ehPdfValido(buffer)).toBe(true);
  });
});

describe("gerarExtratoVendedorExcel", () => {
  it("gera um .xlsx com os mesmos dados do extrato em PDF", async () => {
    const buffer = await gerarExtratoVendedorExcel(EXTRATO_FIXTURE);

    const workbook = new ExcelJS.Workbook();
    // Cast por causa do shim de tipos incompatível de exceljs (ver
    // comentário em painel-excel.ts) — buffer é um Buffer de Node de
    // verdade em tempo de execução.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    // Linha 1 é o título mesclado (tituloSheet) — cabeçalho e dados deslocam uma linha.
    const resumo = workbook.getWorksheet("Resumo");
    expect(resumo?.getRow(3).getCell(2).value).toBe("Vendedor Um");
    expect(resumo?.getRow(4).getCell(2).value).toBe(1); // Total de casos
    expect(resumo?.getRow(5).getCell(2).value).toBe(300); // Multa total

    const casos = workbook.getWorksheet("Casos");
    expect(casos?.rowCount).toBe(3); // título + cabeçalho + 1 caso
    expect(casos?.getRow(3).getCell(1).value).toBe(42); // Protocolo
    expect(casos?.getRow(3).getCell(2).value).toBe("Cliente Teste");
  });

  it("não quebra quando o vendedor não tem nenhum caso", async () => {
    const buffer = await gerarExtratoVendedorExcel({ ...EXTRATO_FIXTURE, casos: [], totalCasos: 0, multaTotalGeral: 0 });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const casos = workbook.getWorksheet("Casos");
    expect(casos?.rowCount).toBe(2); // título + cabeçalho
  });
});
