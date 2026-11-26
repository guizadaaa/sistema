import { describe, expect, it } from "vitest";

import { mimeDoAnexo, tipoVisualAnexo } from "./anexo-tipo";

describe("mimeDoAnexo", () => {
  it("aceita HTML pela extensão (MIME vazio ou octet-stream) e grava text/html", () => {
    expect(mimeDoAnexo("erro.html", "text/html")).toBe("text/html");
    expect(mimeDoAnexo("ERRO.HTM", "")).toBe("text/html");
    expect(mimeDoAnexo("pagina.html", "application/octet-stream")).toBe("text/html");
    expect(mimeDoAnexo("pagina.html", "text/html; charset=iso-8859-1")).toBe("text/html");
  });
  it("continua aceitando PDF e imagens", () => {
    expect(mimeDoAnexo("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(mimeDoAnexo("a.webp", "image/webp")).toBe("image/webp");
  });
  it("recusa .exe, .js e HTML sem extensão de HTML", () => {
    expect(mimeDoAnexo("virus.exe", "application/x-msdownload")).toBeNull();
    expect(mimeDoAnexo("virus.exe", "")).toBeNull();
    expect(mimeDoAnexo("app.js", "text/javascript")).toBeNull();
    expect(mimeDoAnexo("app.js", "application/octet-stream")).toBeNull();
    expect(mimeDoAnexo("pagina.html", "application/javascript")).toBeNull();
    expect(mimeDoAnexo("pagina.txt", "text/html")).toBeNull();
  });
  it("tipo visual da lista", () => {
    expect(tipoVisualAnexo("erro.htm")).toBe("html");
    expect(tipoVisualAnexo("a.PDF")).toBe("pdf");
    expect(tipoVisualAnexo("print.webp")).toBe("imagem");
  });
});
