import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrazoVigencia } from "./prazo-vigencia";

function textos(html: string): string[] {
  return [...html.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
}

describe("PrazoVigencia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // "Hoje" bem depois do prazo: se o resolvido ainda usasse now(), apareceria "Vencido há X dias".
    vi.setSystemTime(new Date(2026, 9, 1, 12)); // 01/10/2026
  });
  afterEach(() => vi.useRealTimers());

  it("resolvido antes do prazo: data neutra + badge verde com os dias", () => {
    const html = renderToStaticMarkup(
      <PrazoVigencia prazoVigencia="2026-08-20" statusAtual="resolvido" resolvidoEm="2026-08-10T15:00:00Z" />
    );
    expect(textos(html)).toEqual(["20/08/2026", "Resolvido 10 dias antes"]);
    expect(html).toContain("bg-emerald-500/15");
    expect(html).not.toContain("Vencido");
  });

  it("resolvido depois do prazo: data neutra + badge vermelho com os dias", () => {
    const html = renderToStaticMarkup(
      <PrazoVigencia prazoVigencia="2026-08-20" statusAtual="resolvido" resolvidoEm="2026-08-21T15:00:00Z" />
    );
    expect(textos(html)).toEqual(["20/08/2026", "Resolvido 1 dia depois"]);
    expect(html).toContain("bg-destructive/15");
  });

  it("não resolvido dentro do prazo: data neutra + badge verde (Vence em X dias)", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-12-31" statusAtual="recepcionado" />);
    expect(textos(html)).toEqual(["31/12/2026", "Vence em 91 dias"]);
    expect(html).toContain("bg-emerald-500/15");
  });

  it("não resolvido vencido: data neutra + badge vermelho (Vencido há X dias)", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-09-26" statusAtual="inicial" />);
    expect(textos(html)).toEqual(["26/09/2026", "Vencido há 5 dias"]);
    expect(html).toContain("bg-destructive/15");
  });

  it("resolvido sem data de resolução conhecida cai no comportamento atual", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-09-26" statusAtual="resolvido" resolvidoEm={null} />);
    expect(textos(html)).toEqual(["26/09/2026", "Vencido há 5 dias"]);
  });
});
