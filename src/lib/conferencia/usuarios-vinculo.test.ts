import { describe, expect, it } from "vitest";

import { agruparUsuariosParaVinculo, type UsuarioParaVinculo } from "./usuarios-vinculo";

const usuarios: UsuarioParaVinculo[] = [
  { id: "a", nome: "Zuleica 1710", perfil: "vendedor", filial: "1710" },
  { id: "b", nome: "Ana 1714", perfil: "vendedor", filial: "1714" },
  { id: "c", nome: "Érica 1714", perfil: "gerente", filial: "1714" },
  { id: "d", nome: "Jean Transferido", perfil: "vendedor", filial: "1730" },
  { id: "e", nome: "Guilherme Luz", perfil: "adm_master", filial: null },
  { id: "f", nome: "Bruna Adm", perfil: "adm", filial: null },
  { id: "g", nome: "Carlos 1714", perfil: "vendedor", filial: "1714" },
];

describe("agruparUsuariosParaVinculo", () => {
  it("linha da 1714: usuários da 1714 primeiro, depois outras lojas e administração (alfabético)", () => {
    const g = agruparUsuariosParaVinculo(usuarios, "1714");
    expect(g.sugeridos).toEqual([]);
    expect(g.daLoja.map((u) => u.nome)).toEqual(["Ana 1714", "Carlos 1714", "Érica 1714"]);
    expect(g.outrasLojas.map((u) => u.nome)).toEqual(["Jean Transferido", "Zuleica 1710"]);
    expect(g.administracao.map((u) => u.nome)).toEqual(["Bruna Adm", "Guilherme Luz"]);
  });

  it("sugeridos no topo, na ordem do ranking, sem repetir nos grupos (no máximo 3)", () => {
    const g = agruparUsuariosParaVinculo(usuarios, "1714", ["e", "d", "x-inativo", "g", "a"]);
    expect(g.sugeridos.map((u) => u.id)).toEqual(["e", "d", "g"]);
    expect(g.daLoja.map((u) => u.id)).toEqual(["b", "c"]);
    expect(g.outrasLojas.map((u) => u.id)).toEqual(["a"]);
    expect(g.administracao.map((u) => u.id)).toEqual(["f"]);
  });

  it("ninguém some: todo usuário aparece em exatamente um grupo", () => {
    const g = agruparUsuariosParaVinculo(usuarios, "1710", ["c"]);
    const ids = [...g.sugeridos, ...g.daLoja, ...g.outrasLojas, ...g.administracao].map((u) => u.id).sort();
    expect(ids).toEqual(usuarios.map((u) => u.id).sort());
  });
});
