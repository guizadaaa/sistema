import { describe, expect, it } from "vitest";

import { nomeArquivoValido, nomePdfVitrine, nomesImagensVitrine, slugArquivo } from "./nomes";

describe("nomes de arquivo da vitrine", () => {
  it("PNG = slug do título, sem acento; capa = capa.png; repetido ganha sufixo", () => {
    const nomes = nomesImagensVitrine([
      { pagina: 1, titulo: "PARTIU VIAJAR", capa: true },
      { pagina: 2, titulo: "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ" },
      { pagina: 3, titulo: "MSC VIRTUOSA BÚZIOS, SALVADOR E MACEIÓ" },
      { pagina: 4, titulo: "!!!" },
    ]);
    expect([...nomes.values()]).toEqual([
      "capa.png",
      "msc-virtuosa-buzios-salvador-e-maceio.png",
      "msc-virtuosa-buzios-salvador-e-maceio-2.png",
      "pagina-4.png",
    ]);
  });

  it("PDF = '{categoria} - {titulo}.pdf', sem acento nem caractere inválido", () => {
    expect(nomePdfVitrine("Cruzeiros", "MSC: Búzios / Salvador?")).toBe("Cruzeiros - MSC Buzios Salvador.pdf");
    expect(nomePdfVitrine("", "")).toBe("vitrine.pdf");
  });

  it("validação igual à do banco", () => {
    expect(nomeArquivoValido("Cruzeiros - MSC Buzios.pdf", "pdf")).toBe(true);
    expect(nomeArquivoValido("../x.pdf", "pdf")).toBe(false);
    expect(nomeArquivoValido("a/b.png", "png")).toBe(false);
    expect(nomeArquivoValido(`${slugArquivo("Ç")}x.png`, "png")).toBe(true);
  });
});
