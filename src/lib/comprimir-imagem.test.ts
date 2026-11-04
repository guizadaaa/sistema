import { describe, expect, it, vi } from "vitest";

import { comprimirImagem, dimensoesAlvo, type CodecImagem } from "./comprimir-imagem";

const arquivo = (tipo: string, bytes: number, nome = "imagem-colada.png") => new File([new Uint8Array(bytes)], nome, { type: tipo });

/** Codec falso: devolve `tamanhoSaida` bytes no tipo pedido (ou PNG, se "sem WebP"). */
function codec(dimensoes: { largura: number; altura: number }, tamanhoSaida: number, suportaWebp = true) {
  const codificar = vi.fn(async (_a: Blob, _alvo: { largura: number; altura: number }, tipo: string) =>
    new Blob([new Uint8Array(tamanhoSaida)], { type: tipo === "image/webp" && !suportaWebp ? "image/png" : tipo })
  );
  return { codec: { dimensoes: async () => dimensoes, codificar } satisfies CodecImagem, codificar };
}

describe("dimensoesAlvo", () => {
  it("limita o lado maior a 2000 px mantendo a proporção; nunca aumenta", () => {
    expect(dimensoesAlvo({ largura: 3840, altura: 2160 })).toEqual({ largura: 2000, altura: 1125 });
    expect(dimensoesAlvo({ largura: 1080, altura: 2400 })).toEqual({ largura: 900, altura: 2000 });
    expect(dimensoesAlvo({ largura: 1366, altura: 768 })).toEqual({ largura: 1366, altura: 768 });
  });
});

describe("comprimirImagem", () => {
  it("print grande: WebP, 2000 px, qualidade 0,85, nome com .webp", async () => {
    const { codec: c, codificar } = codec({ largura: 3840, altura: 2160 }, 300_000);
    const saida = await comprimirImagem(arquivo("image/png", 2_000_000), c);
    expect(saida.type).toBe("image/webp");
    expect(saida.name).toBe("imagem-colada.webp");
    expect(saida.size).toBe(300_000);
    expect(codificar).toHaveBeenCalledWith(expect.anything(), { largura: 2000, altura: 1125 }, "image/webp", 0.85);
  });

  it("sem WebP no navegador: JPEG", async () => {
    const { codec: c, codificar } = codec({ largura: 1920, altura: 1080 }, 200_000, false);
    const saida = await comprimirImagem(arquivo("image/png", 1_000_000), c);
    expect(saida.type).toBe("image/jpeg");
    expect(saida.name).toBe("imagem-colada.jpg");
    expect(codificar).toHaveBeenLastCalledWith(expect.anything(), { largura: 1920, altura: 1080 }, "image/jpeg", 0.85);
  });

  it("mantém o original quando não diminui", async () => {
    const original = arquivo("image/jpeg", 50_000, "foto.jpg");
    const { codec: c } = codec({ largura: 800, altura: 600 }, 60_000);
    expect(await comprimirImagem(original, c)).toBe(original);
  });

  it("PDF e outros tipos passam direto, sem tocar no codec", async () => {
    const pdf = arquivo("application/pdf", 500_000, "contrato.pdf");
    const { codec: c, codificar } = codec({ largura: 1, altura: 1 }, 1);
    expect(await comprimirImagem(pdf, c)).toBe(pdf);
    expect(codificar).not.toHaveBeenCalled();
  });

  it("falha ao decodificar: envia o original", async () => {
    const original = arquivo("image/png", 10);
    const quebrado: CodecImagem = { dimensoes: () => Promise.reject(new Error("x")), codificar: vi.fn() };
    expect(await comprimirImagem(original, quebrado)).toBe(original);
  });
});
