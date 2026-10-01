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

  it("resolvido antes do prazo: verde, duas linhas com os dias até o prazo", () => {
    const html = renderToStaticMarkup(
      <PrazoVigencia prazoVigencia="2026-08-20" statusAtual="resolvido" resolvidoEm="2026-08-10T15:00:00Z" />
    );
    expect(textos(html)).toEqual(["Resolvido antes do prazo", "10 dias"]);
    expect(html).toContain("text-emerald-600");
    expect(html).not.toContain("Vencido");
  });

  it("resolvido depois do prazo: vermelho, duas linhas com os dias de atraso", () => {
    const html = renderToStaticMarkup(
      <PrazoVigencia prazoVigencia="2026-08-20" statusAtual="resolvido" resolvidoEm="2026-08-21T15:00:00Z" />
    );
    expect(textos(html)).toEqual(["Resolvido depois do prazo", "1 dia"]);
    expect(html).toContain("text-destructive");
  });

  it("não resolvido dentro do prazo: comportamento atual (data + Vence em X dias, verde)", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-12-31" statusAtual="recepcionado" />);
    expect(textos(html)).toEqual(["31/12/2026", "Vence em 91 dias"]);
    expect(html).toContain("text-emerald-600");
  });

  it("não resolvido vencido: comportamento atual (data + Vencido há X dias, vermelho)", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-09-26" statusAtual="inicial" />);
    expect(textos(html)).toEqual(["26/09/2026", "Vencido há 5 dias"]);
    expect(html).toContain("text-destructive");
  });

  it("resolvido sem data de resolução conhecida cai no comportamento atual", () => {
    const html = renderToStaticMarkup(<PrazoVigencia prazoVigencia="2026-09-26" statusAtual="resolvido" resolvidoEm={null} />);
    expect(textos(html)).toEqual(["26/09/2026", "Vencido há 5 dias"]);
  });
});
