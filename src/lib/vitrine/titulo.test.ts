import { describe, expect, it } from "vitest";

import { sugerirTituloOferta } from "./titulo";

describe("sugerirTituloOferta", () => {
  it("usa o texto depois de 'A partir de:'", () => {
    expect(sugerirTituloOferta("CRUZEIROS MSC\nA partir de:\nMSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ")).toBe(
      "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ"
    );
  });

  it("tira preço, parcelas e condições", () => {
    expect(
      sugerirTituloOferta("8 noites A partir de: MSC SEAVIEW ILHABELA E BÚZIOS\n10x de R$ 349,90 por pessoa + taxas *")
    ).toBe("MSC SEAVIEW ILHABELA E BÚZIOS");
  });

  it("aceita variação de caixa e espaços no marcador", () => {
    expect(sugerirTituloOferta("a  partir  de  MSC ARMONIA   Búzios")).toBe("MSC ARMONIA Búzios");
  });

  it("sem marcador: primeira linha com letras (capa)", () => {
    expect(sugerirTituloOferta("\n2026\nPARTIU VIAJAR\nCVC")).toBe("PARTIU VIAJAR");
  });

  it("texto vazio vira título vazio", () => {
    expect(sugerirTituloOferta("")).toBe("");
  });
});
