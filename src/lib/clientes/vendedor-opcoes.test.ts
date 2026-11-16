import { describe, expect, it } from "vitest";

import { filtrarOpcoesVendedor, rotuloVendedor, VENDEDOR_EX, VENDEDOR_SITE, type OpcaoVendedorBase } from "./vendedor-opcoes";

const opcoes: OpcaoVendedorBase[] = [
  { categoria: "atual", valor: "usuario:2", rotulo: "Dayane Peres Kawaguchi", loja: "1710" },
  { categoria: "atual", valor: "usuario:1", rotulo: "Alejandra Beatriz Garcia", loja: "1710" },
  { categoria: "atual", valor: "usuario:3", rotulo: "Tálita Gomes", loja: "1714" },
  { categoria: "ex", valor: "Jean Carlos Campos Olynik", rotulo: "Jean Carlos Campos Olynik", loja: "1710" },
  { categoria: "ex", valor: "Jean Carlos Campos Olynik", rotulo: "Jean Carlos Campos Olynik", loja: "1714" },
  { categoria: "ex", valor: "Sophia De Souza", rotulo: "Sophia De Souza", loja: "1710" },
];

describe("filtrarOpcoesVendedor", () => {
  it("sem busca: Todos, equipe atual em ordem alfabética, ex (todos), site — sem ex individuais", () => {
    const g = filtrarOpcoesVendedor(opcoes, "");
    expect(g.todos && g.exTodos && g.site).toBe(true);
    expect(g.atuais.map((o) => o.rotulo)).toEqual(["Alejandra Beatriz Garcia", "Dayane Peres Kawaguchi", "Tálita Gomes"]);
    expect(g.exIndividuais).toEqual([]);
  });

  it("com loja: só a equipe atual daquela loja", () => {
    expect(filtrarOpcoesVendedor(opcoes, "", "1714").atuais.map((o) => o.rotulo)).toEqual(["Tálita Gomes"]);
  });

  it("busca por parte do nome encontra o ex-vendedor (sem repetir o nome de lojas diferentes)", () => {
    const g = filtrarOpcoesVendedor(opcoes, "olyn");
    expect(g.exIndividuais.map((o) => o.rotulo)).toEqual(["Jean Carlos Campos Olynik"]);
    expect(g.atuais).toEqual([]);
    expect(g.todos || g.site).toBe(false);
  });

  it("busca sem acento e sem maiúsculas; 'internet' acha o grupo do site", () => {
    expect(filtrarOpcoesVendedor(opcoes, "TALITA").atuais.map((o) => o.rotulo)).toEqual(["Tálita Gomes"]);
    expect(filtrarOpcoesVendedor(opcoes, "internet").site).toBe(true);
    expect(filtrarOpcoesVendedor(opcoes, "ex-vend").exTodos).toBe(true);
  });
});

describe("rotuloVendedor", () => {
  it("rótulos dos grupos, da equipe atual e do ex-vendedor", () => {
    expect(rotuloVendedor(undefined, opcoes)).toBe("Todos");
    expect(rotuloVendedor(VENDEDOR_EX, opcoes)).toBe("Ex-vendedores (todos)");
    expect(rotuloVendedor(VENDEDOR_SITE, opcoes)).toBe("Site / Internet");
    expect(rotuloVendedor("usuario:1", opcoes)).toBe("Alejandra Beatriz Garcia");
    expect(rotuloVendedor("Sophia De Souza", opcoes)).toBe("Sophia De Souza (ex-vendedor)");
  });
});
