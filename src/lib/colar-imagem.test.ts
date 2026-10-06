import { describe, expect, it } from "vitest";

import { imagensDaAreaDeTransferencia, nomeImagemColada } from "./colar-imagem";

function transferencia(arquivos: File[]): DataTransfer {
  return { files: arquivos } as unknown as DataTransfer;
}

describe("imagensDaAreaDeTransferencia", () => {
  const aceitos = ["image/png", "image/jpeg"];

  it("devolve só imagens dos tipos aceitos, renomeadas", () => {
    const resultado = imagensDaAreaDeTransferencia(
      transferencia([
        new File(["a"], "image.png", { type: "image/png" }),
        new File(["b"], "doc.pdf", { type: "application/pdf" }),
        new File(["c"], "anim.gif", { type: "image/gif" }),
        new File(["d"], "foto.jpg", { type: "image/jpeg" }),
      ]),
      aceitos
    );
    expect(resultado.map((f) => f.type)).toEqual(["image/png", "image/jpeg"]);
    expect(resultado.every((f) => f.name.startsWith("imagem-colada-"))).toBe(true);
    expect(new Set(resultado.map((f) => f.name)).size).toBe(2);
  });

  it("colar só texto (sem arquivos) não devolve nada", () => {
    expect(imagensDaAreaDeTransferencia(transferencia([]), aceitos)).toEqual([]);
    expect(imagensDaAreaDeTransferencia(null, aceitos)).toEqual([]);
  });
});

describe("nomeImagemColada", () => {
  it("usa a extensão do tipo", () => {
    const quando = new Date("2026-10-06T12:34:56Z");
    expect(nomeImagemColada("image/jpeg", quando)).toBe("imagem-colada-20261006-123456.jpg");
    expect(nomeImagemColada("image/png", quando)).toBe("imagem-colada-20261006-123456.png");
  });
});
