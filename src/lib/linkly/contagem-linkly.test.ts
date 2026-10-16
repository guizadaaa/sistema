import { describe, expect, it } from "vitest";

import { calcularPreviaBase, extrairContagensPorLink, trechoBrutoSeguro, urlContadoresPorLink } from "./contagem-linkly";

describe("extrairContagensPorLink", () => {
  it("reconhece { total, values: [{ value, count }] } (value numérico ou texto)", () => {
    const mapa = extrairContagensPorLink({ total: 15, values: [{ value: 24, count: 10 }, { value: "25", count: 5 }] });
    expect(mapa).toEqual(new Map([["24", 10], ["25", 5]]));
  });

  it("lista vazia é reconhecida (nenhum clique no período)", () => {
    expect(extrairContagensPorLink({ total: 0, values: [] })).toEqual(new Map());
  });

  it("não adivinha: qualquer outro formato devolve null", () => {
    expect(extrairContagensPorLink([{ link_id: 24, clicks: 10 }])).toBeNull();
    expect(extrairContagensPorLink({ data: [{ value: 24, count: 10 }] })).toBeNull();
    expect(extrairContagensPorLink({ values: [{ link_id: 24, count: 10 }] })).toBeNull();
    expect(extrairContagensPorLink({ values: [{ value: 24, count: "10" }] })).toBeNull();
    expect(extrairContagensPorLink({ values: [{ value: 24, count: -1 }] })).toBeNull();
    expect(extrairContagensPorLink(null)).toBeNull();
  });
});

describe("trechoBrutoSeguro", () => {
  it("remove a API key e limita o tamanho", () => {
    expect(trechoBrutoSeguro('{"erro":"key abc123 invalida","url":"?api_key=abc123"}', "abc123")).toBe(
      '{"erro":"key *** invalida","url":"?api_key=***"}'
    );
    expect(trechoBrutoSeguro("x".repeat(20), "k", 10)).toBe("xxxxxxxxxx… (truncado)");
  });
});

describe("urlContadoresPorLink", () => {
  it("monta o endpoint de contadores por link com o intervalo e o fuso de São Paulo", () => {
    expect(urlContadoresPorLink("42", "chave", "2026-10-01", "2026-10-16")).toBe(
      "https://app.linklyhq.com/api/v1/workspace/42/clicks/counters/link_id?api_key=chave&start=2026-10-01&end=2026-10-16&timezone=America%2FSao_Paulo"
    );
  });
});

describe("calcularPreviaBase", () => {
  it("base = total atual - cliques do mês", () => {
    expect(calcularPreviaBase(1000, 120)).toEqual({ ok: true, base: 880 });
    expect(calcularPreviaBase(1000, 0)).toEqual({ ok: true, base: 1000 });
    expect(calcularPreviaBase(1000, 1000)).toEqual({ ok: true, base: 0 });
  });

  it("recusa negativo, não inteiro, maior que o total e link sem total", () => {
    expect(calcularPreviaBase(1000, -1).ok).toBe(false);
    expect(calcularPreviaBase(1000, 1.5).ok).toBe(false);
    expect(calcularPreviaBase(1000, 1001)).toEqual({
      ok: false,
      motivo: "Maior que o total atual (1000) — confira o número (a contagem do Linkly pode estar defasada).",
    });
    expect(calcularPreviaBase(null, 10).ok).toBe(false);
    expect(calcularPreviaBase(1000, null).ok).toBe(false);
  });
});
