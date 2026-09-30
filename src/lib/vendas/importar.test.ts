import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { ErroImportacaoVendas, importarVendasPlanilha } from "./importar";

type Row = Record<string, unknown>;

/** Fake mínimo: SELECT em vendas_com_vendedor (.eq/.in) e upsert em vendas_importadas. */
function criarSupabaseFake(opcoes: { existentes?: Row[]; erroUpsert?: { message: string } } = {}) {
  const upserts: Row[] = [];
  const supabase = {
    from(tabela: string) {
      if (tabela === "vendas_importadas") {
        return {
          upsert(lote: Row[]) {
            if (opcoes.erroUpsert) return Promise.resolve({ error: opcoes.erroUpsert });
            upserts.push(...lote);
            return Promise.resolve({ error: null });
          },
        };
      }
      let filtrado = opcoes.existentes ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq(coluna: string, valor: unknown) {
          filtrado = filtrado.filter((r) => r[coluna] === valor);
          return builder;
        },
        in(coluna: string, valores: unknown[]) {
          filtrado = filtrado.filter((r) => valores.includes(r[coluna]));
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({ data: filtrado, error: null });
        },
      };
      return builder;
    },
  };
  return { supabase: supabase as unknown as Parameters<typeof importarVendasPlanilha>[0], upserts };
}

const CABECALHO = ["", "Venda Nº", "Vendedor", "Data Venda", "Pagante", "Produto", "Comissão", "Valor Total"];

/** Replica o formato da exportação da CVC: coluna A em branco, cabeçalho na linha 1. */
async function montarPlanilha(linhas: unknown[][], cabecalho: string[] = CABECALHO): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vendas");
  sheet.addRow(cabecalho);
  for (const linha of linhas) sheet.addRow(linha);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

const DATA = new Date(Date.UTC(2026, 8, 15));

describe("importarVendasPlanilha", () => {
  it("importa as linhas reais e ignora o rodapé de totais (sem Venda Nº) sem aviso nem erro", async () => {
    const arquivo = await montarPlanilha([
      [null, 1001, "Ana", DATA, "Cliente A", "Pacote X", 100, 1000],
      [null, 1002, "Bruno", DATA, "Cliente B", "Pacote Y", 50, 500],
      [null, null, null, null, null, null, 150, 1500],
    ]);
    const { supabase, upserts } = criarSupabaseFake({ existentes: [{ filial: "1710", venda_numero: 1002 }] });

    const resultado = await importarVendasPlanilha(supabase, "1710", arquivo);

    expect(resultado).toEqual({ novas: 1, atualizadas: 1, avisos: [] });
    expect(upserts.map((u) => u.venda_numero)).toEqual([1001, 1002]);
    expect(upserts[0]).toMatchObject({ filial: "1710", data_venda: "2026-09-15", valor_total: 1000 });
  });

  it("rodapé com fórmula (Comissão/Valor Total como { formula, result }) também é silencioso", async () => {
    const arquivo = await montarPlanilha([
      [null, 1001, "Ana", DATA, "Cliente A", "Pacote X", 100, 1000],
      [null, null, null, null, null, null, { formula: "SUM(G2:G2)", result: 100 }, { formula: "SUM(H2:H2)", result: 1000 }],
    ]);
    const { supabase } = criarSupabaseFake();

    expect((await importarVendasPlanilha(supabase, "1710", arquivo)).avisos).toEqual([]);
  });

  it("linha COM Venda Nº mas sem Vendedor gera aviso específico daquela linha e não é gravada", async () => {
    const arquivo = await montarPlanilha([
      [null, 1001, "Ana", DATA, "Cliente A", "Pacote X", 100, 1000],
      [null, 1002, null, DATA, "Cliente B", "Pacote Y", 50, 500],
      [null, 1003, "Caio", DATA, "", "Pacote Z", 10, null],
      [null, 1004, "Duda", "ontem", "Cliente D", "Pacote W", 10, "abc"],
      [null, null, null, null, null, null, 160, 1500],
    ]);
    const { supabase, upserts } = criarSupabaseFake();

    const resultado = await importarVendasPlanilha(supabase, "1710", arquivo);

    expect(resultado.novas).toBe(1);
    expect(upserts.map((u) => u.venda_numero)).toEqual([1001]);
    expect(resultado.avisos).toEqual([
      "Linha 3: sem Vendedor — ignorada.",
      "Linha 4: sem Pagante, Valor Total — ignorada.",
      "Linha 5: valor inválido em Data Venda, Valor Total — ignorada.",
    ]);
  });

  it("não chama o banco quando nenhuma linha é válida, mas ainda devolve os avisos", async () => {
    const arquivo = await montarPlanilha([[null, 1002, null, DATA, "Cliente B", "Pacote Y", 50, 500]]);
    const { supabase, upserts } = criarSupabaseFake();

    const resultado = await importarVendasPlanilha(supabase, "1710", arquivo);

    expect(resultado).toEqual({ novas: 0, atualizadas: 0, avisos: ["Linha 2: sem Vendedor — ignorada."] });
    expect(upserts).toEqual([]);
  });

  it("coluna obrigatória ausente vira ErroImportacaoVendas nomeando a coluna", async () => {
    const arquivo = await montarPlanilha([], ["", "Venda Nº", "Data Venda", "Pagante", "Produto", "Valor Total"]);
    const { supabase } = criarSupabaseFake();

    const promessa = importarVendasPlanilha(supabase, "1710", arquivo);
    await expect(promessa).rejects.toBeInstanceOf(ErroImportacaoVendas);
    await expect(promessa).rejects.toThrow("coluna(s) não encontrada(s): Vendedor");
  });

  it("arquivo que não é .xlsx de verdade vira ErroImportacaoVendas com a causa real", async () => {
    const arquivo = new TextEncoder().encode("isto não é um xlsx").buffer as ArrayBuffer;
    const { supabase } = criarSupabaseFake();

    const promessa = importarVendasPlanilha(supabase, "1710", arquivo);
    await expect(promessa).rejects.toBeInstanceOf(ErroImportacaoVendas);
    await expect(promessa).rejects.toThrow(/^Não foi possível ler o arquivo como \.xlsx/);
  });

  it("erro do banco no upsert vira ErroImportacaoVendas com a mensagem do banco", async () => {
    const arquivo = await montarPlanilha([[null, 1001, "Ana", DATA, "Cliente A", "Pacote X", 100, 1000]]);
    const { supabase } = criarSupabaseFake({ erroUpsert: { message: "new row violates row-level security policy" } });

    const promessa = importarVendasPlanilha(supabase, "1710", arquivo);
    await expect(promessa).rejects.toBeInstanceOf(ErroImportacaoVendas);
    await expect(promessa).rejects.toThrow(
      "Erro no banco de dados ao gravar as vendas: new row violates row-level security policy"
    );
  });
});
