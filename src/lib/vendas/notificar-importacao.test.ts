import { describe, expect, it, vi } from "vitest";

import { avisarImportacaoVendas } from "./notificar-importacao";

function fake(resposta: { data?: number | null; error?: { message: string } | null } | Error) {
  const rpc = vi.fn(async () => {
    if (resposta instanceof Error) throw resposta;
    return { data: resposta.data ?? null, error: resposta.error ?? null };
  });
  return { supabase: { rpc } as unknown as Parameters<typeof avisarImportacaoVendas>[0], rpc };
}

describe("avisarImportacaoVendas", () => {
  it("importação 0 novas / 0 atualizadas não avisa ninguém", async () => {
    const { supabase, rpc } = fake({ data: 3 });
    const r = await avisarImportacaoVendas(supabase, "1710", { novas: 0, atualizadas: 0, ate: null, avisos: ["x"] });
    expect(r).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chama a RPC com a loja e a maior Data Venda e devolve quantos foram avisados", async () => {
    const { supabase, rpc } = fake({ data: 4 });
    const r = await avisarImportacaoVendas(supabase, "1710", { novas: 2, atualizadas: 0, ate: "2026-11-11", avisos: [] });
    expect(rpc).toHaveBeenCalledWith("notificar_vendas_importadas", { p_filial: "1710", p_ate: "2026-11-11" });
    expect(r).toEqual({ avisados: 4 });
  });

  it("sem data nas linhas usa hoje em São Paulo", async () => {
    const { supabase, rpc } = fake({ data: 1 });
    // 02:00 UTC de 12/11 ainda é 11/11 em São Paulo.
    await avisarImportacaoVendas(supabase, "1714", { novas: 0, atualizadas: 1, ate: null, avisos: [] }, new Date("2026-11-12T02:00:00Z"));
    expect(rpc).toHaveBeenCalledWith("notificar_vendas_importadas", { p_filial: "1714", p_ate: "2026-11-11" });
  });

  it("erro da RPC vira aviso, não erro", async () => {
    const { supabase } = fake({ error: { message: "boom" } });
    const r = await avisarImportacaoVendas(supabase, "1710", { novas: 1, atualizadas: 0, ate: "2026-11-11", avisos: [] });
    expect(r.avisados).toBeUndefined();
    expect(r.avisoNotificacao).toContain("boom");
    expect(r.avisoNotificacao).toContain("vendas foram importadas");
  });

  it("exceção (rede) também vira aviso", async () => {
    const { supabase } = fake(new Error("fetch failed"));
    const r = await avisarImportacaoVendas(supabase, "1710", { novas: 1, atualizadas: 0, ate: "2026-11-11", avisos: [] });
    expect(r.avisoNotificacao).toContain("fetch failed");
  });
});
