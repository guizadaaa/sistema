import { describe, expect, it, vi } from "vitest";

import { CacheUrlsAssinadas, VALIDADE_URL_S } from "./cache-urls";

const HORA = 60 * 60 * 1000;

function montar() {
  let agora = 0;
  let geracao = 0;
  const gerar = vi.fn(async (faltando: string[], validadeS: number) => {
    geracao++;
    expect(validadeS).toBe(VALIDADE_URL_S);
    return new Map(faltando.map((c) => [c, `${c}?token=${geracao}`]));
  });
  const cache = new CacheUrlsAssinadas({ agora: () => agora });
  return { cache, gerar, avancar: (ms: number) => (agora += ms) };
}

describe("CacheUrlsAssinadas", () => {
  it("reaproveita a mesma URL dentro da janela (faltando mais de 24 h)", async () => {
    const { cache, gerar, avancar } = montar();
    const primeira = await cache.obter(["a.webp", "b.webp"], gerar);
    avancar(5 * 24 * HORA); // faltam 2 dias
    const segunda = await cache.obter(["a.webp", "b.webp"], gerar);
    expect(segunda).toEqual(primeira);
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("gera de novo quando faltam menos de 24 h", async () => {
    const { cache, gerar, avancar } = montar();
    const primeira = await cache.obter(["a.webp"], gerar);
    avancar(6 * 24 * HORA + 1); // faltam menos de 24 h
    const segunda = await cache.obter(["a.webp"], gerar);
    expect(segunda.get("a.webp")).not.toBe(primeira.get("a.webp"));
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("só gera os caminhos que faltam, numa chamada só", async () => {
    const { cache, gerar } = montar();
    await cache.obter(["a.webp"], gerar);
    const urls = await cache.obter(["a.webp", "c.webp", "c.webp"], gerar);
    expect(gerar).toHaveBeenLastCalledWith(["c.webp"], VALIDADE_URL_S);
    expect([...urls.keys()]).toEqual(["a.webp", "c.webp"]);
  });

  it("parametrizável: 24 h de validade e 2 h de folga (anexos de protocolo)", async () => {
    let agora = 0;
    const gerar = vi.fn(async (faltando: string[], validadeS: number) => {
      expect(validadeS).toBe(24 * 60 * 60);
      return new Map(faltando.map((c) => [c, `${c}?t=${agora}`]));
    });
    const cache = new CacheUrlsAssinadas({ validadeS: 24 * 60 * 60, folgaMinimaS: 2 * 60 * 60, agora: () => agora });
    const primeira = await cache.obter(["caso/x.webp"], gerar);
    agora = 21 * HORA + 59 * 60 * 1000; // faltam 2 h 01 min
    expect((await cache.obter(["caso/x.webp"], gerar)).get("caso/x.webp")).toBe(primeira.get("caso/x.webp"));
    agora = 22 * HORA + 1; // faltam menos de 2 h
    expect((await cache.obter(["caso/x.webp"], gerar)).get("caso/x.webp")).not.toBe(primeira.get("caso/x.webp"));
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("recusa folga maior ou igual à validade", () => {
    expect(() => new CacheUrlsAssinadas({ validadeS: 3600, folgaMinimaS: 3600 })).toThrow();
  });
});
