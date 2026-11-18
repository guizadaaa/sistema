import { describe, expect, it } from "vitest";

import { casaMostrar, contarPorMostrar, lerMostrar, type GrupoMapeamento } from "./mapeamento-grupos";

const linhas: { nome: string; grupo: GrupoMapeamento; pareceAtivo: boolean }[] = [
  { nome: "Alejandra", grupo: "atual", pareceAtivo: false },
  { nome: "Dayane", grupo: "atual", pareceAtivo: false },
  { nome: "Jean (saiu)", grupo: "sem_vinculo", pareceAtivo: false },
  { nome: "Rosane (nova)", grupo: "sem_vinculo", pareceAtivo: true },
  { nome: "Agencia De Viagens Cvc Tur - Internet", grupo: "site", pareceAtivo: false },
];
const nomes = (m: Parameters<typeof casaMostrar>[1]) => linhas.filter((l) => casaMostrar(l, m)).map((l) => l.nome);

describe("filtro Mostrar", () => {
  it("cada opção traz só o grupo certo", () => {
    expect(nomes("atual")).toEqual(["Alejandra", "Dayane"]);
    expect(nomes("sem_vinculo")).toEqual(["Jean (saiu)", "Rosane (nova)"]);
    expect(nomes("parecem")).toEqual(["Rosane (nova)"]);
    expect(nomes("site")).toEqual(["Agencia De Viagens Cvc Tur - Internet"]);
    expect(nomes("todos")).toHaveLength(5);
  });

  it("totais por opção", () => {
    expect(contarPorMostrar(linhas)).toEqual({ atual: 2, sem_vinculo: 2, parecem: 1, site: 1, todos: 5 });
  });

  it("padrão é Equipe atual; links antigos continuam valendo", () => {
    expect(lerMostrar({})).toBe("atual");
    expect(lerMostrar({ mostrar: "site" })).toBe("site");
    expect(lerMostrar({ parecem: "1" })).toBe("parecem");
    expect(lerMostrar({ sem_vinculo: "1" })).toBe("sem_vinculo");
    expect(lerMostrar({ mostrar: "x" })).toBe("atual");
  });
});
