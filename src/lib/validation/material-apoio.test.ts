import { describe, expect, it } from "vitest";

import { normalizarUrlMaterialApoio, validarArquivoMaterialApoio } from "./material-apoio";

const MB = 1024 * 1024;

describe("validarArquivoMaterialApoio", () => {
  it("aceita o mime type oficial de cada tipo", () => {
    expect(validarArquivoMaterialApoio("pdf", { type: "application/pdf", size: MB })).toBeUndefined();
    expect(validarArquivoMaterialApoio("imagem", { type: "image/png", size: MB })).toBeUndefined();
    expect(validarArquivoMaterialApoio("imagem", { type: "image/jpeg", size: MB })).toBeUndefined();
    expect(
      validarArquivoMaterialApoio("docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: MB,
      })
    ).toBeUndefined();
    expect(
      validarArquivoMaterialApoio("xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: MB })
    ).toBeUndefined();
  });

  it("recusa arquivo que não bate com o tipo escolhido", () => {
    expect(validarArquivoMaterialApoio("pdf", { type: "image/png", size: MB })).toMatch(/Formato não permitido para o tipo PDF/);
    expect(validarArquivoMaterialApoio("imagem", { type: "image/gif", size: MB })).toMatch(/tipo Imagem/);
  });

  it("recusa vazio e acima de 10 MB", () => {
    expect(validarArquivoMaterialApoio("pdf", { type: "application/pdf", size: 0 })).toBe("Selecione um arquivo.");
    expect(validarArquivoMaterialApoio("pdf", { type: "application/pdf", size: 10 * MB + 1 })).toBe("Arquivo maior que 10 MB.");
  });
});

describe("normalizarUrlMaterialApoio", () => {
  it("aceita http(s) e apara espaços", () => {
    expect(normalizarUrlMaterialApoio("  https://exemplo.com/a  ")).toBe("https://exemplo.com/a");
    expect(normalizarUrlMaterialApoio("http://exemplo.com")).toBe("http://exemplo.com/");
  });

  it("recusa outros esquemas e texto que não é url", () => {
    expect(normalizarUrlMaterialApoio("javascript:alert(1)")).toBeUndefined();
    expect(normalizarUrlMaterialApoio("ftp://exemplo.com")).toBeUndefined();
    expect(normalizarUrlMaterialApoio("exemplo.com")).toBeUndefined();
    expect(normalizarUrlMaterialApoio("")).toBeUndefined();
  });
});
