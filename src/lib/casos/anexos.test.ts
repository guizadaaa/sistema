import { describe, expect, it } from "vitest";

import { enviarImagensDescricao } from "./anexos";

function criarSupabaseFake() {
  const uploads: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const supabase = {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => {
          uploads.push(`${bucket}:${path}`);
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: () => ({
      insert: (linha: Record<string, unknown>) => {
        inserts.push(linha);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { supabase: supabase as unknown as Parameters<typeof enviarImagensDescricao>[0], uploads, inserts };
}

function formCom(arquivos: File[]): FormData {
  const fd = new FormData();
  for (const a of arquivos) fd.append("descricaoImagem", a);
  return fd;
}

describe("enviarImagensDescricao", () => {
  it("grava cada imagem como anexo imagem_descricao no path <caso_id>/ do bucket anexos", async () => {
    const { supabase, uploads, inserts } = criarSupabaseFake();
    const avisos = await enviarImagensDescricao(
      supabase,
      "caso-1",
      formCom([new File(["x"], "imagem-colada-1.png", { type: "image/png" })])
    );

    expect(avisos).toEqual([]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^anexos:caso-1\/.+-imagem-colada-1\.png$/);
    expect(inserts).toEqual([
      expect.objectContaining({ caso_id: "caso-1", tipo_documento: "imagem_descricao", nome_arquivo: "imagem-colada-1.png" }),
    ]);
  });

  it("recusa o que não é JPG/PNG e o que passa de 10 MB, sem gravar", async () => {
    const { supabase, uploads, inserts } = criarSupabaseFake();
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" });
    const avisos = await enviarImagensDescricao(
      supabase,
      "caso-1",
      formCom([new File(["x"], "doc.pdf", { type: "application/pdf" }), grande])
    );

    expect(avisos).toHaveLength(2);
    expect(uploads).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("limita a 5 imagens", async () => {
    const { supabase, inserts } = criarSupabaseFake();
    const seis = Array.from({ length: 6 }, (_, i) => new File(["x"], `img-${i}.png`, { type: "image/png" }));
    const avisos = await enviarImagensDescricao(supabase, "caso-1", formCom(seis));

    expect(inserts).toHaveLength(5);
    expect(avisos).toEqual(["Só as 5 primeiras imagens da descrição foram enviadas."]);
  });

  it("sem imagem coladas, não faz nada", async () => {
    const { supabase, uploads } = criarSupabaseFake();
    expect(await enviarImagensDescricao(supabase, "caso-1", new FormData())).toEqual([]);
    expect(uploads).toEqual([]);
  });
});
