import { describe, expect, it } from "vitest";

import { gruposVendedor, vendedorNaFilial, type CandidatoVendedor } from "./opcoes-vendedor";

const c = (id: string, nome: string, filial: CandidatoVendedor["filial"], ativo: boolean, filiaisCasos: CandidatoVendedor["filiaisCasos"] = []): CandidatoVendedor => ({
  id, nome, filial, ativo, filiaisCasos,
});

const candidatos = [
  c("dayane", "Dayane", "1710", true, ["1710"]),
  c("adriana", "Adriana", "1710", true),
  c("bryan", "Bryan", "1714", true, ["1714"]),
  c("jean", "Jean", "1730", true, ["1710", "1730"]), // transferido da 1710 para a 1730
  c("sophia", "Sophia", "1710", false, ["1710"]), // saiu
  c("zeca", "Zeca", "1730", true),
  c("alejandra", "Álejandra", "1730", true),
];

describe("gruposVendedor", () => {
  it("Filial 1710: ativos da 1710 + 'Outros com casos nesta filial' (outra loja / inativo)", () => {
    const g = gruposVendedor(candidatos, "1710");
    expect(g.grupos).toEqual([{ loja: "1710", opcoes: [{ id: "adriana", nome: "Adriana" }, { id: "dayane", nome: "Dayane" }] }]);
    expect(g.outros).toEqual([
      { id: "jean", nome: "Jean", etiqueta: "outra loja" },
      { id: "sophia", nome: "Sophia", etiqueta: "inativo" },
    ]);
  });

  it("transferido aparece na lista normal da loja nova", () => {
    const g = gruposVendedor(candidatos, "1730");
    expect(g.grupos[0].opcoes.map((o) => o.id)).toEqual(["alejandra", "jean", "zeca"]);
    expect(g.outros).toEqual([]);
  });

  it("Filial = Todas: ativos agrupados por loja, alfabético; sem inativos", () => {
    const g = gruposVendedor(candidatos);
    expect(g.grupos.map((x) => [x.loja, x.opcoes.map((o) => o.id)])).toEqual([
      ["1710", ["adriana", "dayane"]],
      ["1714", ["bryan"]],
      ["1730", ["alejandra", "jean", "zeca"]],
    ]);
    expect(g.outros).toEqual([]);
  });

  it("vendedor incompatível com a filial é ignorado (URL antiga / troca de Filial)", () => {
    expect(vendedorNaFilial(candidatos, "1710", "zeca")).toBe(false);
    expect(vendedorNaFilial(candidatos, "1710", "jean")).toBe(true);
    expect(vendedorNaFilial(candidatos, "1710", "sophia")).toBe(true);
    expect(vendedorNaFilial(candidatos, undefined, "sophia")).toBe(false);
    expect(vendedorNaFilial(candidatos, undefined, "zeca")).toBe(true);
    expect(vendedorNaFilial(candidatos, "1710", undefined)).toBe(false);
  });
});
