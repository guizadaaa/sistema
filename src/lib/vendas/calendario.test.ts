import { describe, expect, it } from "vitest";

import type { Feriado } from "@/lib/feriados/dia-util";

import { mesAnterior, mesSeguinte, nomeMes, resumoDoMes, semanasDoMes, statusMarcador } from "./calendario";

const feriados: Feriado[] = [
  { data: "2026-11-20", nome: "Consciência Negra", abrangencia: "nacional", filial: null, facultativo: false },
  { data: "2026-11-02", nome: "Finados", abrangencia: "nacional", filial: null, facultativo: false },
  { data: "2026-11-11", nome: "Municipal de teste", abrangencia: "municipal", filial: "1730", facultativo: false },
];
const HOJE = "2026-11-18";

describe("statusMarcador", () => {
  it("dia útil passado sem importação = vermelho (atrasada)", () => {
    expect(statusMarcador("2026-11-17", "1710", HOJE, false, feriados)).toBe("atrasada");
  });
  it("fim de semana e feriado sem importação = sem vermelho", () => {
    expect(statusMarcador("2026-11-14", "1710", HOJE, false, feriados)).toBe("vazio"); // sábado
    expect(statusMarcador("2026-11-02", "1710", HOJE, false, feriados)).toBe("vazio"); // Finados
    expect(statusMarcador("2026-11-11", "1730", HOJE, false, feriados)).toBe("vazio"); // municipal da 1730
    expect(statusMarcador("2026-11-11", "1710", HOJE, false, feriados)).toBe("atrasada"); // dia útil para a 1710
  });
  it("dia com importação = verde, mesmo em fim de semana", () => {
    expect(statusMarcador("2026-11-17", "1710", HOJE, true, feriados)).toBe("importou");
    expect(statusMarcador("2026-11-15", "1710", HOJE, true, feriados)).toBe("importou");
  });
  it("hoje antes de importar e dias futuros = vazio", () => {
    expect(statusMarcador(HOJE, "1710", HOJE, false, feriados)).toBe("vazio");
    expect(statusMarcador("2026-11-25", "1710", HOJE, false, feriados)).toBe("vazio");
  });
});

describe("mês", () => {
  it("semanas de segunda a domingo", () => {
    const s = semanasDoMes("2026-11");
    expect(s[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]); // 01/11/2026 é domingo
    expect(s[1][0]).toBe("2026-11-02");
    expect(s.flat().filter(Boolean)).toHaveLength(30);
  });
  it("navegação e nome", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesSeguinte("2026-12")).toBe("2027-01");
    expect(nomeMes("2026-11")).toBe("Novembro/2026");
  });
  it("resumo: dias úteis e em dia por loja", () => {
    const importou = (dia: string, loja: string) => loja === "1710" ? dia <= "2026-11-17" && dia !== "2026-11-10" : dia === "2026-11-03";
    const r = resumoDoMes("2026-11", ["1710", "1730"], HOJE, importou, feriados);
    expect(r.diasUteis).toBe(19); // 21 dias de semana - Finados - Consciência Negra
    // Até 17/11 (hoje sem importação): 2..17 sem Finados = 11 dias úteis.
    expect(r.porLoja[0]).toEqual({ loja: "1710", esperados: 11, emDia: 10 });
    // 1730 tem o municipal de 11/11: 10 esperados, 1 em dia.
    expect(r.porLoja[1]).toEqual({ loja: "1730", esperados: 10, emDia: 1 });
  });
});
