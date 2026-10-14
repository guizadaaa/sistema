import { describe, expect, it } from "vitest";

import { mesAtualSaoPaulo, opcoesDeMes, resolverMes, rotuloMes, sincronizacaoAtrasada } from "./mes";

describe("mesAtualSaoPaulo", () => {
  it("usa o fuso de São Paulo na virada do mês (01/11 02:00 UTC ainda é outubro)", () => {
    expect(mesAtualSaoPaulo(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-01");
    expect(mesAtualSaoPaulo(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11-01");
  });
});

describe("resolverMes", () => {
  const disponiveis = ["2026-10-01", "2026-09-01"];

  it("aceita o mês atual ou um mês com registro", () => {
    expect(resolverMes("2026-09", disponiveis, "2026-10-01")).toBe("2026-09-01");
    expect(resolverMes("2026-10", disponiveis, "2026-10-01")).toBe("2026-10-01");
  });

  it("mês sem registro, formato inválido ou ausente cai no mês atual", () => {
    expect(resolverMes("2026-07", disponiveis, "2026-10-01")).toBe("2026-10-01");
    expect(resolverMes("abc", disponiveis, "2026-10-01")).toBe("2026-10-01");
    expect(resolverMes(undefined, disponiveis, "2026-10-01")).toBe("2026-10-01");
  });
});

describe("opcoesDeMes", () => {
  it("mês atual sempre presente, sem repetir, do mais recente ao mais antigo", () => {
    expect(opcoesDeMes(["2026-09-01", "2026-10-01"], "2026-11-01")).toEqual(["2026-11-01", "2026-10-01", "2026-09-01"]);
  });
});

describe("rotuloMes", () => {
  it("formata em português", () => {
    expect(rotuloMes("2026-10-01")).toBe("outubro de 2026");
  });
});

describe("sincronizacaoAtrasada", () => {
  const agora = new Date("2026-10-14T15:00:00Z");
  it("mais de 3 horas atrás está atrasada; até 3 horas não", () => {
    expect(sincronizacaoAtrasada("2026-10-14T11:59:00Z", agora)).toBe(true);
    expect(sincronizacaoAtrasada("2026-10-14T12:01:00Z", agora)).toBe(false);
  });
  it("sem nenhuma sincronização registrada conta como atrasada", () => {
    expect(sincronizacaoAtrasada(null, agora)).toBe(true);
  });
});
