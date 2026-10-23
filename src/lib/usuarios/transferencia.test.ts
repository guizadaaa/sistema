import { describe, expect, it } from "vitest";

import { podeTransferirLoja } from "./transferencia";

const gerente1710 = { id: "g", perfil: "gerente" as const, filial: "1710" as const };
const adm = { id: "a", perfil: "adm" as const, filial: null };

describe("podeTransferirLoja", () => {
  it("gerente só transfere vendedor da própria loja", () => {
    expect(podeTransferirLoja(gerente1710, { id: "v", perfil: "vendedor", filial: "1710" })).toBe(true);
    expect(podeTransferirLoja(gerente1710, { id: "v", perfil: "vendedor", filial: "1714" })).toBe(false);
    expect(podeTransferirLoja(gerente1710, { id: "g2", perfil: "gerente", filial: "1710" })).toBe(false);
    expect(podeTransferirLoja(gerente1710, gerente1710)).toBe(false);
  });

  it("adm transfere vendedor e gerente de qualquer loja, mas não admin", () => {
    expect(podeTransferirLoja(adm, { id: "v", perfil: "vendedor", filial: "1730" })).toBe(true);
    expect(podeTransferirLoja(adm, { id: "g", perfil: "gerente", filial: "1714" })).toBe(true);
    expect(podeTransferirLoja(adm, { id: "m", perfil: "adm_master", filial: null })).toBe(false);
  });

  it("vendedor não transfere ninguém", () => {
    expect(podeTransferirLoja({ id: "x", perfil: "vendedor", filial: "1710" }, { id: "v", perfil: "vendedor", filial: "1710" })).toBe(false);
  });
});
