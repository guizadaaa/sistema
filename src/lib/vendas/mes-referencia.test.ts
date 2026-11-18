import { describe, expect, it } from "vitest";

import type { Feriado } from "@/lib/feriados/dia-util";

import { montarPeriodoVendas, periodoDaReferencia } from "./mes-referencia";

const feriados: Feriado[] = [{ data: "2026-11-20", nome: "Consciência Negra", abrangencia: "nacional", filial: null, facultativo: false }];
const ref = (loja: string, ate: string | null, importadoEm: string | null = "2026-11-18T15:01:00Z") => ({ loja, ate, importadoEm });

describe("mês de referência", () => {
  it('"até 17/11" -> 01/11 a 17/11', () => {
    expect(periodoDaReferencia("2026-11-17")).toEqual({ de: "2026-11-01", ate: "2026-11-17" });
  });

  it('"até 30/11" visto em 01/12, antes de importar -> novembro inteiro, sem alerta', () => {
    const p = montarPeriodoVendas({ lojas: ["1710"], referencias: [ref("1710", "2026-11-30", "2026-12-01T00:30:00Z")], hoje: "2026-12-01", feriados });
    expect(p.periodos).toEqual([{ filial: "1710", de: "2026-11-01", ate: "2026-11-30" }]);
    expect(p.rotulo).toBe("Novembro/2026 · vendas até 30/11 (importação de 30/11 21:30)");
    expect(p.alertas).toEqual([]);
  });

  it("uma loja: rótulo com a hora da importação", () => {
    const p = montarPeriodoVendas({ lojas: ["1710"], referencias: [ref("1710", "2026-11-17")], hoje: "2026-11-18", feriados });
    expect(p.rotulo).toBe("Novembro/2026 · vendas até 17/11 (importação de 18/11 12:01)");
  });

  it("Todas: cada filial no seu período; loja no mês anterior destacada", () => {
    const p = montarPeriodoVendas({
      lojas: ["1710", "1714", "1730"],
      referencias: [ref("1710", "2026-11-17"), ref("1714", "2026-10-31"), ref("1730", "2026-11-16")],
      hoje: "2026-11-18",
      feriados,
    });
    expect(p.periodos).toEqual([
      { filial: "1710", de: "2026-11-01", ate: "2026-11-17" },
      { filial: "1714", de: "2026-10-01", ate: "2026-10-31" },
      { filial: "1730", de: "2026-11-01", ate: "2026-11-16" },
    ]);
    expect(p.rotulo).toBe(
      "Novembro/2026 · 1710 até 17/11 · 1714 até 31/10 — sem importação em novembro · 1730 até 16/11 — importação atrasada (esperado até 17/11)"
    );
    expect(p.alertas).toEqual(["1714", "1730"]);
  });

  it("atrasada considera feriado: em 23/11 (seg) o esperado é 19/11 (20 é feriado)", () => {
    const p = montarPeriodoVendas({ lojas: ["1710"], referencias: [ref("1710", "2026-11-19")], hoje: "2026-11-23", feriados });
    expect(p.alertas).toEqual([]);
  });

  it("loja sem nenhuma importação fica de fora da soma", () => {
    const p = montarPeriodoVendas({ lojas: ["1710", "1730"], referencias: [ref("1710", "2026-11-17"), ref("1730", null, null)], hoje: "2026-11-18", feriados });
    expect(p.periodos).toEqual([{ filial: "1710", de: "2026-11-01", ate: "2026-11-17" }]);
    expect(p.rotulo).toBe("Novembro/2026 · 1710 até 17/11 · 1730 — sem importação");
  });

  it("período escolhido manualmente vence o padrão", () => {
    const p = montarPeriodoVendas({
      lojas: ["1710", "1714"],
      referencias: [ref("1710", "2026-11-17"), ref("1714", "2026-11-17")],
      hoje: "2026-11-18",
      feriados,
      dataInicio: "2026-09-01",
      dataFim: "2026-09-30",
    });
    expect(p.manual).toBe(true);
    expect(p.periodos).toEqual([
      { filial: "1710", de: "2026-09-01", ate: "2026-09-30" },
      { filial: "1714", de: "2026-09-01", ate: "2026-09-30" },
    ]);
    expect(p.rotulo).toBe("Período escolhido: 01/09/2026 a 30/09/2026");
  });
});
