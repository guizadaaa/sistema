import { describe, expect, it } from "vitest";

import { validarEInserirRecibosRecadastrados } from "./recibos-recadastrados";

function criarSupabaseFake(erroPorNumero: Record<string, { code: string }> = {}) {
  const inserts: Record<string, unknown>[] = [];
  const supabase = {
    from: (tabela: string) => ({
      insert: (linha: { recibo_numero: string }) => {
        expect(tabela).toBe("casos_recibos_recadastrados");
        const erro = erroPorNumero[linha.recibo_numero];
        if (!erro) inserts.push(linha);
        return Promise.resolve({ error: erro ?? null });
      },
    }),
  };
  return { supabase: supabase as unknown as Parameters<typeof validarEInserirRecibosRecadastrados>[0], inserts };
}

function form(numeros: string[]): FormData {
  const fd = new FormData();
  for (const n of numeros) fd.append("reciboRecadastrado", n);
  return fd;
}

describe("validarEInserirRecibosRecadastrados", () => {
  it("grava cada número válido (máscara removida) e ignora linhas vazias", async () => {
    const { supabase, inserts } = criarSupabaseFake();
    const avisos = await validarEInserirRecibosRecadastrados(supabase, "c1", form(["1710.9999.000001", "", "17109999000002"]));
    expect(avisos).toEqual([]);
    expect(inserts).toEqual([
      { caso_id: "c1", recibo_numero: "17109999000001" },
      { caso_id: "c1", recibo_numero: "17109999000002" },
    ]);
  });

  it("número fora dos 14 dígitos vira aviso com a mesma regra dos contratos", async () => {
    const { supabase, inserts } = criarSupabaseFake();
    const avisos = await validarEInserirRecibosRecadastrados(supabase, "c1", form(["123"]));
    expect(avisos).toEqual(["123: Recibo deve ter exatamente 14 números."]);
    expect(inserts).toEqual([]);
  });

  it("traduz duplicidade e caso que não é Recadastro", async () => {
    const { supabase } = criarSupabaseFake({
      "17109999000001": { code: "23505" },
      "17109999000002": { code: "P0001" },
    });
    const avisos = await validarEInserirRecibosRecadastrados(supabase, "c1", form(["17109999000001", "17109999000002"]));
    expect(avisos).toEqual([
      "17109999000001: este recibo já está vinculado a este caso.",
      "17109999000002: recibo recadastrado só pode ser informado em caso do tipo Recadastro.",
    ]);
  });
});
