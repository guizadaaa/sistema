import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/lib/auth/current-user";

// Delegação vigente do gerente — único dado que podeConduzirFluxo busca.
let delegacoesVigentes: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      lte: () => builder,
      or: () => builder,
      limit: () => Promise.resolve({ data: delegacoesVigentes, error: null }),
    };
    return { from: () => builder };
  },
}));

const { podeAvancarStatus, podeConduzirFluxo } = await import("./permissoes");

function usuario(perfil: CurrentUser["perfil"], filial: CurrentUser["filial"], id = "u1"): CurrentUser {
  return { id, perfil, filial } as CurrentUser;
}

const CASO_1710_DO_U1 = { filial: "1710" as const, vendedor_dono: "u1" };

beforeEach(() => {
  delegacoesVigentes = [];
});

describe("podeAvancarStatus", () => {
  it("vendedor avança só o próprio caso", async () => {
    expect(await podeAvancarStatus(usuario("vendedor", "1710", "u1"), CASO_1710_DO_U1)).toBe(true);
    expect(await podeAvancarStatus(usuario("vendedor", "1710", "u2"), CASO_1710_DO_U1)).toBe(false);
  });

  it("vendedor não conduz desfecho/implicações (podeConduzirFluxo continua falso)", async () => {
    expect(await podeConduzirFluxo(usuario("vendedor", "1710", "u1"), "1710")).toBe(false);
  });

  it("gerente: só com delegação ativa e na própria filial", async () => {
    expect(await podeAvancarStatus(usuario("gerente", "1710", "g1"), CASO_1710_DO_U1)).toBe(false);
    delegacoesVigentes = [{ id: "d1" }];
    expect(await podeAvancarStatus(usuario("gerente", "1710", "g1"), CASO_1710_DO_U1)).toBe(true);
    expect(await podeAvancarStatus(usuario("gerente", "1714", "g2"), CASO_1710_DO_U1)).toBe(false);
  });

  it("admin sempre", async () => {
    expect(await podeAvancarStatus(usuario("adm", null, "a1"), CASO_1710_DO_U1)).toBe(true);
    expect(await podeAvancarStatus(usuario("adm_master", null, "a2"), CASO_1710_DO_U1)).toBe(true);
  });
});
