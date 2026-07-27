import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake mínimo do query builder do supabase-js: cada chamada de filtro
// (.eq/.ilike/.gte/.lte/.in) refina um array em memória; `await` funciona
// porque o objeto é "thenable" (.then), igual ao builder real do
// postgrest-js. Não simula RLS nem policies — só a forma da query, que é o
// que este teste quer garantir (nenhuma interpolação crua vira `.or()`).
type Row = Record<string, unknown>;

function criarSupabaseFake(tabelas: Record<string, Row[]>) {
  return {
    from(tabela: string) {
      let filtrado = tabelas[tabela] ?? [];
      const builder = {
        select() {
          return builder;
        },
        order() {
          return builder;
        },
        eq(coluna: string, valor: unknown) {
          filtrado = filtrado.filter((r) => r[coluna] === valor);
          return builder;
        },
        ilike(coluna: string, padrao: string) {
          const agulha = padrao.replace(/^%|%$/g, "").toLowerCase();
          filtrado = filtrado.filter((r) => String(r[coluna] ?? "").toLowerCase().includes(agulha));
          return builder;
        },
        gte(coluna: string, valor: string) {
          filtrado = filtrado.filter((r) => String(r[coluna]) >= valor);
          return builder;
        },
        lte(coluna: string, valor: string) {
          filtrado = filtrado.filter((r) => String(r[coluna]) <= valor);
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
}

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

const { listarCasos } = await import("./listar");

const CASOS_FIXTURE: Row[] = [
  {
    id: "c1",
    protocolo: 100,
    cliente_nome: "Maria (Filial Centro)",
    status_atual: "inicial",
    prazo_vigencia: "2026-12-31",
    tipo_caso: "alteracao_data",
    filial: "1710",
    criado_em: "2026-01-10T10:00:00",
    vendedor_dono: "v1",
    contrato_numero: "17100000000001",
    cliente_cpf: "11144477735",
    caso_teste: false,
  },
  {
    id: "c2",
    protocolo: 101,
    cliente_nome: "João Silva",
    status_atual: "inicial",
    prazo_vigencia: "2026-12-31",
    tipo_caso: "alteracao_data",
    filial: "1710",
    criado_em: "2026-06-15T10:00:00",
    vendedor_dono: "v1",
    contrato_numero: "17100000000002",
    cliente_cpf: "22233344456",
    caso_teste: false,
  },
  {
    id: "c3",
    protocolo: 102,
    cliente_nome: "Caso de Teste",
    status_atual: "inicial",
    prazo_vigencia: "2026-12-31",
    tipo_caso: "alteracao_data",
    filial: "1710",
    criado_em: "2026-06-20T10:00:00",
    vendedor_dono: "v1",
    contrato_numero: "17100000000003",
    cliente_cpf: "33344455567",
    caso_teste: true,
  },
];

const CONTRATOS_ADICIONAIS_FIXTURE: Row[] = [{ caso_id: "c2", contrato_numero: "99999999999999" }];
const USUARIOS_FIXTURE: Row[] = [{ id: "v1", nome_completo: "Vendedor Um" }];

beforeEach(() => {
  createClientMock.mockResolvedValue(
    criarSupabaseFake({
      casos: CASOS_FIXTURE,
      casos_contratos_adicionais: CONTRATOS_ADICIONAIS_FIXTURE,
      usuarios: USUARIOS_FIXTURE,
    })
  );
});

describe("listarCasos — busca geral (bug B1)", () => {
  it("nome de cliente com parênteses não quebra a busca (antes: .or() cru interpolava o termo)", async () => {
    const resultado = await listarCasos({ busca: "Maria (Filial Centro)" });
    expect(resultado.map((c) => c.id)).toEqual(["c1"]);
  });

  it("busca por protocolo numérico", async () => {
    const resultado = await listarCasos({ busca: "101" });
    expect(resultado.map((c) => c.id)).toEqual(["c2"]);
  });

  it("busca geral acha pelo contrato adicional, não só o principal", async () => {
    const resultado = await listarCasos({ busca: "9999" });
    expect(resultado.map((c) => c.id)).toEqual(["c2"]);
  });

  it("busca geral com 11 dígitos casa por CPF (com ou sem máscara)", async () => {
    const resultado = await listarCasos({ busca: "111.444.777-35" });
    expect(resultado.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("listarCasos — filtros novos", () => {
  it("filtro de período exclui casos abertos fora do intervalo", async () => {
    const resultado = await listarCasos({ dataInicio: "2026-06-01", dataFim: "2026-06-30" });
    expect(resultado.map((c) => c.id)).toEqual(["c2"]);
  });

  it("busca + período combinados são interseção (AND), não união", async () => {
    const resultado = await listarCasos({ busca: "Maria", dataInicio: "2026-06-01", dataFim: "2026-06-30" });
    expect(resultado).toEqual([]);
  });
});

describe("listarCasos — casos de teste", () => {
  it("sem mostrarTeste, casos de teste ficam de fora por padrão", async () => {
    const resultado = await listarCasos({});
    expect(resultado.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("com mostrarTeste, casos de teste aparecem junto com os demais", async () => {
    const resultado = await listarCasos({ mostrarTeste: true });
    expect(resultado.map((c) => c.id).sort()).toEqual(["c1", "c2", "c3"]);
  });
});
