import { describe, expect, it } from "vitest";

import { gruposPorGrau, hrefVerTodos, lerModoEmAberto, MODO_EM_ABERTO_PADRAO, type CasoEmAberto } from "./em-aberto";

function caso(protocolo: number, prioridade: CasoEmAberto["prioridade"], totalGrau: number): CasoEmAberto {
  return {
    id: `id-${protocolo}`,
    protocolo,
    clienteNome: `Cliente ${protocolo}`,
    statusAtual: "inicial",
    filial: "1710",
    prioridade,
    entrouEm: "2026-11-01T00:00:00Z",
    totalGrau,
  };
}

describe("gruposPorGrau", () => {
  it("blocos na ordem que vem do banco, com o total do grau no subtítulo", () => {
    const grupos = gruposPorGrau([caso(10, 4, 2), caso(11, 4, 2), caso(5, 3, 7), caso(1, 1, 1), caso(2, null, 40)]);
    expect(grupos.map((g) => [g.chave, g.rotulo, g.casos.map((c) => c.protocolo)])).toEqual([
      [4, "Urgente · 2", [10, 11]],
      [3, "Alta · 7", [5]],
      [1, "Baixa · 1", [1]],
      ["sem", "Sem grau · 40", [2]],
    ]);
  });

  it("vazio sem grupos", () => {
    expect(gruposPorGrau([])).toEqual([]);
  });
});

describe("chave Por grau | Por tempo parado", () => {
  it("padrão por grau; só aceita os dois valores salvos", () => {
    expect(MODO_EM_ABERTO_PADRAO).toBe("grau");
    expect(lerModoEmAberto("parado")).toBe("parado");
    expect(lerModoEmAberto("filial")).toBeUndefined();
    expect(lerModoEmAberto(null)).toBeUndefined();
  });

  it("\"Ver todos\" abre a lista na mesma ordem do card", () => {
    expect(hrefVerTodos("grau")).toBe("/casos?aberto=1&ordem=prioridade");
    expect(hrefVerTodos("parado")).toBe("/casos?aberto=1&ordem=parado");
  });
});
