import { beforeEach, describe, expect, it, vi } from "vitest";

// Ordem segura da migração de nomes: copia → atualiza o banco → só então apaga.

const estado = vi.hoisted(() => ({
  ops: [] as string[],
  falharCopia: "",
  arquivos: [] as { id: string; filial: string; titulo: string; pdf_path: string; capa_pagina: number | null; categoria_id: string }[],
  ofertas: [] as { imagem_path: string; titulo: string; filial: string; arquivo_id: string }[],
  pasta: [] as { name: string }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () => {
        if (tabela === "vitrine_arquivos") return Promise.resolve({ data: estado.arquivos, error: null });
        if (tabela === "vitrine_categorias") return Promise.resolve({ data: [{ id: "c1", nome: "Cruzeiros" }], error: null });
        return {
          in: (_c: string, ids: string[]) =>
            Promise.resolve({ data: estado.ofertas.filter((o) => ids.includes(o.arquivo_id)), error: null }),
        };
      },
      update: (valores: Record<string, string>) => ({
        eq: (coluna: string, valor: string) => {
          estado.ops.push(`update ${tabela} ${coluna}=${valor} -> ${Object.values(valores)[0]}`);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    storage: {
      from: () => ({
        copy: (de: string, para: string) => {
          estado.ops.push(`copy ${de} -> ${para}`);
          return Promise.resolve({ error: de === estado.falharCopia ? { message: "falhou" } : null });
        },
        list: () => Promise.resolve({ data: estado.pasta, error: null }),
        remove: (caminhos: string[]) => {
          estado.ops.push(`remove ${caminhos.join(", ")}`);
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));

import { migrarNomesVitrine } from "./migrar-nomes";

beforeEach(() => {
  estado.ops = [];
  estado.falharCopia = "";
  estado.arquivos = [
    { id: "a1", filial: "1710", titulo: "Vitrine azul", pdf_path: "1710/a1.pdf", capa_pagina: 1, categoria_id: "c1" },
    // cópia publicada na 1714, apontando para a pasta da 1710
    { id: "b1", filial: "1714", titulo: "Vitrine azul", pdf_path: "1710/a1.pdf", capa_pagina: 1, categoria_id: "c1" },
    { id: "n1", filial: "1710", titulo: "Nova", pdf_path: "1710/n1/Cruzeiros - Nova.pdf", capa_pagina: null, categoria_id: "c1" },
  ];
  estado.ofertas = [
    { arquivo_id: "a1", filial: "1710", titulo: "MSC VIRTUOSA BÚZIOS", imagem_path: "1710/a1/p2.png" },
    { arquivo_id: "b1", filial: "1714", titulo: "Outro título na 1714", imagem_path: "1710/a1/p2.png" },
  ];
  estado.pasta = [{ name: "p1.png" }, { name: "p2.png" }];
});

describe("migrarNomesVitrine", () => {
  it("copia, atualiza todas as cópias e só depois apaga; ignora o layout novo", async () => {
    const resumo = await migrarNomesVitrine();
    expect(resumo).toEqual({ vitrines: 1, arquivos: 3, erros: [] });
    expect(estado.ops).toEqual([
      "copy 1710/a1.pdf -> 1710/a1/Cruzeiros - Vitrine azul.pdf",
      "copy 1710/a1/p2.png -> 1710/a1/msc-virtuosa-buzios.png",
      "copy 1710/a1/p1.png -> 1710/a1/capa.png",
      "update vitrine_arquivos pdf_path=1710/a1.pdf -> 1710/a1/Cruzeiros - Vitrine azul.pdf",
      "update vitrine_ofertas imagem_path=1710/a1/p2.png -> 1710/a1/msc-virtuosa-buzios.png",
      "update vitrine_ofertas imagem_path=1710/a1/p1.png -> 1710/a1/capa.png",
      "remove 1710/a1.pdf, 1710/a1/p2.png, 1710/a1/p1.png",
    ]);
  });

  it("falha na cópia: não atualiza nem apaga nada daquela vitrine", async () => {
    estado.falharCopia = "1710/a1/p2.png";
    const resumo = await migrarNomesVitrine();
    expect(resumo.vitrines).toBe(0);
    expect(resumo.erros).toHaveLength(1);
    expect(estado.ops.some((op) => op.startsWith("update") || op.startsWith("remove"))).toBe(false);
  });
});
