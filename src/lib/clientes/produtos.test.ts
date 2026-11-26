import { describe, expect, it } from "vitest";

import { isCodigoProduto, PRODUTOS, rotuloProduto } from "./produtos";

describe("produtos (1º dígito do Roteiro Systur)", () => {
  it("tabela completa", () => {
    expect(PRODUTOS.map((p) => [p.codigo, p.rotulo])).toEqual([
      [2, "Terrestre nacional"],
      [3, "Rodoaéreo"],
      [4, "Pacote exclusivo"],
      [5, "Aéreo nacional"],
      [7, "Rodoviário"],
      [8, "Cruzeiro"],
      [9, "Internacional"],
    ]);
  });
  it("desconhecido ou nulo = Outros (fora do filtro)", () => {
    expect(rotuloProduto(4)).toBe("Pacote exclusivo");
    expect(rotuloProduto(6)).toBe("Outros");
    expect(rotuloProduto(null)).toBe("Outros");
    expect(isCodigoProduto(6)).toBe(false);
    expect(isCodigoProduto(9)).toBe(true);
  });
});
