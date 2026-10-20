import { beforeEach, describe, expect, it, vi } from "vitest";

// Mesmo fake mínimo do query builder usado em casos/listar.test.ts.
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

const { listarUsuarios } = await import("./listar");

const USUARIOS_FIXTURE: Row[] = [
  { id: "u1", nome_completo: "Ana Paula", perfil: "vendedor", filial: "1710", ativo: true },
  { id: "u2", nome_completo: "Carlos Souza", perfil: "gerente", filial: "1714", ativo: true },
  { id: "u3", nome_completo: "Débora Reis", perfil: "vendedor", filial: "1714", ativo: true },
  { id: "u4", nome_completo: "Eduardo Lima", perfil: "adm_master", filial: null, ativo: true },
  { id: "u5", nome_completo: "Fábio Inativo", perfil: "vendedor", filial: "1714", ativo: false },
  { id: "u6", nome_completo: "Gina Inativa", perfil: "gerente", filial: "1710", ativo: false },
];

beforeEach(() => {
  createClientMock.mockResolvedValue(criarSupabaseFake({ usuarios: USUARIOS_FIXTURE }));
});

describe("listarUsuarios — filtros de filial e perfil", () => {
  it("sem filtro retorna todos os ATIVOS", async () => {
    const resultado = await listarUsuarios();
    expect(resultado.map((u) => u.id)).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("filtra por filial", async () => {
    const resultado = await listarUsuarios({ filial: "1714" });
    expect(resultado.map((u) => u.id)).toEqual(["u2", "u3"]);
  });

  it("filtra por perfil", async () => {
    const resultado = await listarUsuarios({ perfil: "vendedor" });
    expect(resultado.map((u) => u.id)).toEqual(["u1", "u3"]);
  });

  it("filial + perfil combinados são interseção (AND)", async () => {
    const resultado = await listarUsuarios({ filial: "1714", perfil: "vendedor" });
    expect(resultado.map((u) => u.id)).toEqual(["u3"]);
  });
});

describe("listarUsuarios — mostrar inativos", () => {
  it("padrão: só ativos", async () => {
    const resultado = await listarUsuarios({});
    expect(resultado.every((u) => u.ativo)).toBe(true);
  });

  it("mostrarInativos: SOMENTE inativos, sem os ativos", async () => {
    const resultado = await listarUsuarios({ mostrarInativos: true });
    expect(resultado.map((u) => u.id)).toEqual(["u5", "u6"]);
  });

  it("combina com filial e perfil (AND)", async () => {
    expect((await listarUsuarios({ mostrarInativos: true, filial: "1714" })).map((u) => u.id)).toEqual(["u5"]);
    expect((await listarUsuarios({ mostrarInativos: true, perfil: "gerente" })).map((u) => u.id)).toEqual(["u6"]);
    expect(await listarUsuarios({ mostrarInativos: true, filial: "1714", perfil: "gerente" })).toEqual([]);
  });
});
