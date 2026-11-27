import { describe, expect, it } from "vitest";

import {
  compararPrioridade,
  grauDoFiltro,
  lerGrau,
  lerPrioridadeFiltro,
  nomePrioridade,
  PRIORIDADES,
  PRIORIDADES_DESC,
  rotuloFiltroPrioridade,
} from "./prioridade";

describe("PRIORIDADES (rótulos e ajuda numa constante só)", () => {
  it("escala 1..4 com nome, frase de ajuda e quem resolve", () => {
    expect(PRIORIDADES.map((p) => [p.grau, p.nome, p.ajuda, p.quem])).toEqual([
      [1, "Baixa", "Resolvo sozinho, sem prazo apertado", "Vendedor"],
      [2, "Média", "Resolvo sozinho, mas tem data limite", "Vendedor"],
      [3, "Alta", "Preciso de apoio (negociação, aprovação, fornecedor)", "Gerente/adm"],
      [
        4,
        "Urgente",
        "Preciso de apoio agora (embarque em até 72 h, cliente viajando, Procon/Reclame Aqui, valor alto)",
        "Gerente/adm",
      ],
    ]);
    expect(PRIORIDADES_DESC.map((p) => p.nome)).toEqual(["Urgente", "Alta", "Média", "Baixa"]);
  });

  it("casos antigos (null) são \"Sem grau\"", () => {
    expect(nomePrioridade(null)).toBe("Sem grau");
    expect(nomePrioridade(4)).toBe("Urgente");
  });

  it("lerGrau só aceita 1..4", () => {
    expect(lerGrau("3")).toBe(3);
    expect([lerGrau("0"), lerGrau("5"), lerGrau(""), lerGrau(null), lerGrau("alta")]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("filtro prioridade= de Acompanhar Casos", () => {
  it("slugs dos graus e \"sem\"; o resto é ignorado", () => {
    expect(["urgente", "alta", "media", "baixa", "sem"].map(lerPrioridadeFiltro)).toEqual(["urgente", "alta", "media", "baixa", "sem"]);
    expect(lerPrioridadeFiltro("todas")).toBeUndefined();
    expect(lerPrioridadeFiltro("4")).toBeUndefined();
  });

  it("grau e rótulo de cada filtro", () => {
    expect(grauDoFiltro("urgente")).toBe(4);
    expect(grauDoFiltro("baixa")).toBe(1);
    expect(grauDoFiltro("sem")).toBeNull();
    expect(rotuloFiltroPrioridade("media")).toBe("Média");
    expect(rotuloFiltroPrioridade("sem")).toBe("Sem grau");
  });
});

describe("compararPrioridade", () => {
  it("Urgente → Alta → Média → Baixa → Sem grau", () => {
    const graus: (1 | 2 | 3 | 4 | null)[] = [null, 2, 4, 1, 3, null];
    expect([...graus].sort(compararPrioridade)).toEqual([4, 3, 2, 1, null, null]);
  });
});
