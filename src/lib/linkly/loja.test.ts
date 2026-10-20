import { describe, expect, it } from "vitest";

import { filtrarPorLoja, resolverLoja } from "./loja";

describe("resolverLoja", () => {
  it("aceita só as filiais CVC", () => {
    expect(resolverLoja("1714")).toBe("1714");
    expect(resolverLoja("todas")).toBeUndefined();
    expect(resolverLoja("9999")).toBeUndefined();
    expect(resolverLoja(["1710", "1714"])).toBeUndefined();
    expect(resolverLoja(undefined)).toBeUndefined();
  });
});

describe("filtrarPorLoja", () => {
  const linhas = [
    { id: "a", filial: "1710" as const },
    { id: "b", filial: "1714" as const },
    { id: "c", filial: "1710" as const },
  ];

  it("sem loja devolve tudo", () => {
    expect(filtrarPorLoja(linhas)).toEqual(linhas);
  });

  it("com loja devolve só as linhas dela", () => {
    expect(filtrarPorLoja(linhas, "1710").map((l) => l.id)).toEqual(["a", "c"]);
    expect(filtrarPorLoja(linhas, "1730")).toEqual([]);
  });
});
