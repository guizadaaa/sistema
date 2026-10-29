import { describe, expect, it } from "vitest";

import { corrigirTituloGravado, sugerirTituloOferta, type TrechoTexto } from "./titulo";

/** [texto, tamanho] por linha. */
const pagina = (...linhas: [string, number][]): TrechoTexto[] => linhas.map(([texto, tamanho]) => ({ texto, tamanho, fimDeLinha: true }));

describe("sugerirTituloOferta", () => {
  it("pega só o nome entre 'A partir de:' e 'Valor'", () => {
    expect(
      sugerirTituloOferta(
        pagina(
          ["CRUZEIROS MSC · 7 NOITES", 30],
          ["A partir de:", 30],
          ["MSC VIRTUOSA BÚZIOS,", 48],
          ["SALVADOR E MACEIÓ", 48],
          ["Valor por pessoa em cabine interna", 20],
          ["10x de R$ 459,90", 64]
        )
      )
    ).toBe("MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ");
  });

  it("'Valor' na mesma linha do nome também corta", () => {
    expect(sugerirTituloOferta(pagina(["A partir de: MSC SEAVIEW ILHABELA E BÚZIOS Valor: R$ 3.899", 40]))).toBe(
      "MSC SEAVIEW ILHABELA E BÚZIOS"
    );
  });

  it("sem 'Valor': primeiras linhas com fonte grande, sem preço nem o marcador", () => {
    expect(
      sugerirTituloOferta(
        pagina(
          ["CRUZEIROS MSC · 5 NOITES", 30],
          ["A partir de:", 30],
          ["MSC PREZIOSA ARGENTINA", 48],
          ["E URUGUAI", 48],
          ["10x de R$ 329,90", 64],
          ["por pessoa + taxas *", 20]
        )
      )
    ).toBe("MSC PREZIOSA ARGENTINA E URUGUAI");
  });

  it("capa: a linha de fonte grande", () => {
    expect(sugerirTituloOferta(pagina(["PARTIU VIAJAR", 110], ["Ofertas da semana · CVC", 34]))).toBe("PARTIU VIAJAR");
  });

  it("página sem texto", () => {
    expect(sugerirTituloOferta([])).toBe("");
  });
});

describe("corrigirTituloGravado", () => {
  it("corta o marcador e tudo a partir de 'Valor'", () => {
    expect(corrigirTituloGravado("A partir de: MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ Valor por pessoa R$ 4.599")).toBe(
      "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ"
    );
  });

  it("não mexe em título que não começa com 'A partir de'", () => {
    expect(corrigirTituloGravado("MSC ARMONIA Valor especial")).toBe("MSC ARMONIA Valor especial");
  });
});
