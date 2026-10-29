import { describe, expect, it } from "vitest";

import { ofertaVencida, validarLinkVitrine, validarValidadeVitrine } from "./vitrine";

describe("validarLinkVitrine", () => {
  it("aceita https de cvc.com.br e subdomínios sem pedir confirmação", () => {
    for (const link of [
      "https://www.cvc.com.br/carrinho-dinamico/abc?x=1",
      "https://cruzeiros.atlas.cvc.com.br/quote/123",
      "https://cvc.com.br/",
    ]) {
      const r = validarLinkVitrine(link);
      expect(r).toMatchObject({ ok: true, dominioCvc: true });
    }
  });

  it("outro domínio é aceito, mas marcado para confirmação", () => {
    expect(validarLinkVitrine("https://msccruzeiros.com.br/oferta")).toMatchObject({ ok: true, dominioCvc: false });
    // parecido não é subdomínio
    expect(validarLinkVitrine("https://falsocvc.com.br/x")).toMatchObject({ ok: true, dominioCvc: false });
    expect(validarLinkVitrine("https://cvc.com.br.golpe.com/x")).toMatchObject({ ok: true, dominioCvc: false });
  });

  it("recusa http, javascript: e texto solto; vazio vira null", () => {
    expect(validarLinkVitrine("http://www.cvc.com.br/x").ok).toBe(false);
    expect(validarLinkVitrine("javascript:alert(1)").ok).toBe(false);
    expect(validarLinkVitrine("www.cvc.com.br").ok).toBe(false);
    expect(validarLinkVitrine("  ")).toEqual({ ok: true, url: null, dominioCvc: true });
  });
});

describe("validade", () => {
  it("valida o formato e calcula vencida", () => {
    expect(validarValidadeVitrine("2026-12-31")).toEqual({ ok: true, data: "2026-12-31" });
    expect(validarValidadeVitrine("31/12/2026").ok).toBe(false);
    expect(validarValidadeVitrine("")).toEqual({ ok: true, data: null });
    expect(ofertaVencida("2026-10-28", "2026-10-29")).toBe(true);
    expect(ofertaVencida("2026-10-29", "2026-10-29")).toBe(false);
    expect(ofertaVencida(null, "2026-10-29")).toBe(false);
  });
});
