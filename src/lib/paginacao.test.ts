import { describe, expect, it } from "vitest";

import { paginar } from "./paginacao";

const lista = Array.from({ length: 23 }, (_, i) => i + 1);

describe("paginar", () => {
  it("fatia 10 por página e calcula o total de páginas", () => {
    expect(paginar(lista, 1, 10)).toEqual({ itens: lista.slice(0, 10), pagina: 1, totalPaginas: 3 });
    expect(paginar(lista, "3", 10)).toEqual({ itens: [21, 22, 23], pagina: 3, totalPaginas: 3 });
  });

  it("página ausente, inválida ou fora do intervalo cai na página válida mais próxima", () => {
    expect(paginar(lista, undefined, 10).pagina).toBe(1);
    expect(paginar(lista, "abc", 10).pagina).toBe(1);
    expect(paginar(lista, "0", 10).pagina).toBe(1);
    expect(paginar(lista, "99", 10).pagina).toBe(3);
  });

  it("lista vazia tem uma página vazia", () => {
    expect(paginar([], 1, 10)).toEqual({ itens: [], pagina: 1, totalPaginas: 1 });
  });
});
