import { beforeEach, describe, expect, it, vi } from "vitest";

// Mesmo fake de query builder de src/lib/casos/listar.test.ts, com suporte a
// `.order()` de verdade (múltiplas chamadas, em ordem de prioridade) — a
// métrica de tempo médio por etapa depende de processar o histórico em
// ordem cronológica por caso.
type Row = Record<string, unknown>;

function criarSupabaseFake(tabelas: Record<string, Row[]>) {
  return {
    from(tabela: string) {
      let filtrado = tabelas[tabela] ?? [];
      const ordens: { coluna: string; ascending: boolean }[] = [];
      const builder = {
        select() {
          return builder;
        },
        order(coluna: string, opcoes?: { ascending?: boolean }) {
          ordens.push({ coluna, ascending: opcoes?.ascending !== false });
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
          const resultado = [...filtrado];
          if (ordens.length > 0) {
            resultado.sort((a, b) => {
              for (const o of ordens) {
                const av = a[o.coluna] as string;
                const bv = b[o.coluna] as string;
                if (av === bv) continue;
                const cmp = av < bv ? -1 : 1;
                return o.ascending ? cmp : -cmp;
              }
              return 0;
            });
          }
          resolve({ data: resultado, error: null });
        },
      };
      return builder;
    },
  };
}

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const { carregarMetricasPainel } = await import("./metricas");

const CASOS_FIXTURE: Row[] = [
  {
    id: "c1",
    protocolo: 1,
    cliente_nome: "Cliente 1",
    status_atual: "resolvido",
    tipo_caso: "alteracao_data",
    filial: "1710",
    vendedor_dono: "v1",
    prazo_vigencia: "2026-12-31",
    caso_teste: false,
  },
  {
    id: "c2",
    protocolo: 2,
    cliente_nome: "Cliente 2",
    status_atual: "resolvido",
    tipo_caso: "alteracao_data",
    filial: "1714",
    vendedor_dono: "v2",
    prazo_vigencia: "2026-12-31",
    caso_teste: false,
  },
];

// c1: 2 dias até recepcionado, +3 dias até resolvido (total 5).
// c2: 4 dias até recepcionado, +1 dia até resolvido (total 5).
const HISTORICO_FIXTURE: Row[] = [
  { caso_id: "c1", status: "inicial", entrou_em: "2026-01-01T00:00:00", duracao: "2 days 00:00:00" },
  { caso_id: "c1", status: "recepcionado", entrou_em: "2026-01-03T00:00:00", duracao: "3 days 00:00:00" },
  { caso_id: "c1", status: "resolvido", entrou_em: "2026-01-06T00:00:00", duracao: "0 days 00:00:00" },
  { caso_id: "c2", status: "inicial", entrou_em: "2026-01-01T00:00:00", duracao: "4 days 00:00:00" },
  { caso_id: "c2", status: "recepcionado", entrou_em: "2026-01-05T00:00:00", duracao: "1 days 00:00:00" },
  { caso_id: "c2", status: "resolvido", entrou_em: "2026-01-06T00:00:00", duracao: "0 days 00:00:00" },
];

const USUARIOS_FIXTURE: Row[] = [
  { id: "v1", nome_completo: "Vendedor Um" },
  { id: "v2", nome_completo: "Vendedor Dois" },
];

beforeEach(() => {
  createClientMock.mockResolvedValue(
    criarSupabaseFake({
      casos: CASOS_FIXTURE,
      status_historico_com_duracao: HISTORICO_FIXTURE,
      usuarios: USUARIOS_FIXTURE,
      implicacoes: [],
      desfechos_visivel: [],
    })
  );
});

describe("carregarMetricasPainel — tempo médio por etapa", () => {
  it("calcula a média geral até cada status a partir da duração já calculada na view", async () => {
    const metricas = await carregarMetricasPainel();

    expect(metricas.tempoMedioPorStatus.inicial).toBeNull();
    expect(metricas.tempoMedioPorStatus.recepcionado).toBeCloseTo(3, 5); // média(2, 4)
    expect(metricas.tempoMedioPorStatus.resolvido).toBeCloseTo(5, 5); // média(5, 5)
  });

  it("recorta por filial quando há mais de uma nos dados", async () => {
    const metricas = await carregarMetricasPainel();

    const porFilial1710 = metricas.tempoMedioPorStatusPorFilial.find((f) => f.filial === "1710");
    const porFilial1714 = metricas.tempoMedioPorStatusPorFilial.find((f) => f.filial === "1714");

    expect(porFilial1710?.porStatus.recepcionado).toBeCloseTo(2, 5);
    expect(porFilial1714?.porStatus.recepcionado).toBeCloseTo(4, 5);
  });

  it("recorta por vendedor", async () => {
    const metricas = await carregarMetricasPainel();

    const porV1 = metricas.tempoMedioPorStatusPorVendedor.find((v) => v.vendedorId === "v1");
    const porV2 = metricas.tempoMedioPorStatusPorVendedor.find((v) => v.vendedorId === "v2");

    expect(porV1?.porStatus.resolvido).toBeCloseTo(5, 5);
    expect(porV2?.porStatus.recepcionado).toBeCloseTo(4, 5);
  });

  it("não popula o recorte por filial quando só há uma filial nos dados (mesmo padrão de tipoMaisComumPorFilial)", async () => {
    const metricas = await carregarMetricasPainel({ filial: "1710" });

    expect(metricas.tempoMedioPorStatusPorFilial).toEqual([]);
    expect(metricas.tempoMedioPorStatus.recepcionado).toBeCloseTo(2, 5);
  });

  it("status nunca alcançado por nenhum caso do grupo fica null, não zero", async () => {
    const metricas = await carregarMetricasPainel();
    expect(metricas.tempoMedioPorStatus.ouvidoria).toBeNull();
  });
});

describe("carregarMetricasPainel — casos de teste", () => {
  it("exclui caso_teste=true do total e das métricas, sempre (sem opção de incluir)", async () => {
    createClientMock.mockResolvedValue(
      criarSupabaseFake({
        casos: [
          ...CASOS_FIXTURE,
          {
            id: "c3",
            protocolo: 3,
            cliente_nome: "Caso de Teste",
            status_atual: "resolvido",
            tipo_caso: "alteracao_data",
            filial: "1710",
            vendedor_dono: "v1",
            prazo_vigencia: "2026-12-31",
            caso_teste: true,
          },
        ],
        status_historico_com_duracao: HISTORICO_FIXTURE,
        usuarios: USUARIOS_FIXTURE,
        implicacoes: [],
        desfechos_visivel: [],
      })
    );

    const metricas = await carregarMetricasPainel();
    expect(metricas.total).toBe(2);
  });
});
