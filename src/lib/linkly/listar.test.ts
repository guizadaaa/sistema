import { describe, expect, it } from "vitest";

import { agruparPorVendedor, type CliquesMes } from "./listar";

const linha = (parcial: Partial<CliquesMes>): CliquesMes => ({
  mapeamentoId: "m",
  linkId: "l",
  filial: "1710",
  shortUrl: "https://linkly.link/x",
  usuarioId: "v1",
  inicio: "2026-10-01",
  fim: "2026-10-31",
  cliques: 0,
  baseParcial: false,
  contagemDesde: null,
  ...parcial,
});

describe("agruparPorVendedor", () => {
  it("soma os trechos do mesmo vendedor em links diferentes", () => {
    const resumo = agruparPorVendedor(
      [linha({ usuarioId: "v1", cliques: 60 }), linha({ usuarioId: "v1", linkId: "l2", cliques: 5 }), linha({ usuarioId: "v2", cliques: 40 })],
      new Map([
        ["v1", "Ana"],
        ["v2", "Bruno"],
      ])
    );
    expect(resumo.map((r) => [r.vendedorNome, r.totalCliques])).toEqual([
      ["Ana", 65],
      ["Bruno", 40],
    ]);
  });

  it("contagem parcial: guarda a data mais tardia de início entre os links do vendedor", () => {
    const [resumo] = agruparPorVendedor(
      [
        linha({ cliques: 10, baseParcial: true, contagemDesde: "2026-10-10" }),
        linha({ linkId: "l2", cliques: 3, baseParcial: true, contagemDesde: "2026-10-14" }),
        linha({ linkId: "l3", cliques: 1 }),
      ],
      new Map([["v1", "Ana"]])
    );
    expect(resumo.contagemDesde).toBe("2026-10-14");
    expect(resumo.totalCliques).toBe(14);
  });

  it("sem base parcial, contagemDesde fica null (desde o dia 1)", () => {
    const [resumo] = agruparPorVendedor([linha({ cliques: 7 })], new Map());
    expect(resumo.contagemDesde).toBeNull();
    expect(resumo.vendedorNome).toBe("—");
  });
});
