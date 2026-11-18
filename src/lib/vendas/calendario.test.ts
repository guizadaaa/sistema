import { describe, expect, it } from "vitest";

import type { Feriado } from "@/lib/feriados/dia-util";

import { cobrancaDesde, mesAnterior, mesSeguinte, nomeMes, resumoDoMes, semanasDoMes, statusMarcador, type HistoricoLoja } from "./calendario";

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

// Novembro/2026: 1710 importa desde 2025 (vendas_importadas), registro diário
// desde 12/11; em 05/11 gravou venda nova (importação reconstruída). 1730 só
// importou pela primeira vez em 16/11.
const historico: Record<string, HistoricoLoja> = {
  "1710": { primeiraImportacao: "2025-06-02", inicioRegistro: "2026-11-12", diasReconstruidos: ["2026-11-05"] },
  "1730": { primeiraImportacao: "2026-11-16", inicioRegistro: "2026-11-12", diasReconstruidos: [] },
};

describe("sem cobrança retroativa", () => {
  it("cinza antes da primeira importação da loja", () => {
    expect(statusMarcador("2026-11-13", "1730", HOJE, false, feriados, historico["1730"])).toBe("antes");
    expect(statusMarcador("2026-11-04", "1730", HOJE, false, feriados, historico["1730"])).toBe("antes");
    expect(statusMarcador("2026-11-04", "1714", HOJE, false, feriados, { primeiraImportacao: null, inicioRegistro: "2026-11-12", diasReconstruidos: [] })).toBe("antes");
  });
  it("verde presumido entre a primeira importação e o início do registro diário", () => {
    for (const dia of ["2026-11-03", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"]) {
      expect(statusMarcador(dia, "1710", HOJE, false, feriados, historico["1710"])).toBe("presumido");
    }
    expect(statusMarcador("2026-11-05", "1710", HOJE, false, feriados, historico["1710"])).toBe("reconstruido");
    // Fim de semana e feriado continuam sem marcador verde.
    expect(statusMarcador("2026-11-07", "1710", HOJE, false, feriados, historico["1710"])).toBe("vazio");
    expect(statusMarcador("2026-11-02", "1710", HOJE, false, feriados, historico["1710"])).toBe("vazio");
  });
  it("a partir do início do registro (ou da primeira importação, se depois): regra atual", () => {
    expect(statusMarcador("2026-11-12", "1710", HOJE, false, feriados, historico["1710"])).toBe("atrasada");
    expect(statusMarcador("2026-11-13", "1710", HOJE, true, feriados, historico["1710"])).toBe("importou");
    expect(statusMarcador("2026-11-17", "1730", HOJE, false, feriados, historico["1730"])).toBe("atrasada");
    expect(statusMarcador("2026-11-16", "1730", HOJE, true, feriados, historico["1730"])).toBe("importou");
    expect(statusMarcador(HOJE, "1710", HOJE, false, feriados, historico["1710"])).toBe("vazio");
  });
  it("venda gravada no próprio dia do início do registro conta como importação", () => {
    const h = { ...historico["1710"], diasReconstruidos: ["2026-11-12"] };
    expect(statusMarcador("2026-11-12", "1710", HOJE, false, feriados, h)).toBe("reconstruido");
  });
  it("resumo ignora os dias presumidos (fora de X e de Y)", () => {
    expect(cobrancaDesde(historico["1710"])).toBe("2026-11-12");
    expect(cobrancaDesde(historico["1730"])).toBe("2026-11-16");
    expect(cobrancaDesde({ primeiraImportacao: null, inicioRegistro: "2026-11-12", diasReconstruidos: [] })).toBeNull();
    const importou = (dia: string, loja: string) => loja === "1710" ? dia >= "2026-11-12" && dia <= "2026-11-17" && dia !== "2026-11-13" : dia === "2026-11-16";
    const r = resumoDoMes("2026-11", ["1710", "1730", "1714"], HOJE, importou, feriados, (l) => historico[l] ?? { primeiraImportacao: null, inicioRegistro: "2026-11-12", diasReconstruidos: [] });
    // 1710: 12, 13, 16, 17 (sem os presumidos de 03 a 11/11); faltou 13/11.
    expect(r.porLoja[0]).toEqual({ loja: "1710", esperados: 4, emDia: 3 });
    // 1730: 16 e 17/11.
    expect(r.porLoja[1]).toEqual({ loja: "1730", esperados: 2, emDia: 1 });
    // 1714 nunca importou: nada cobrado.
    expect(r.porLoja[2]).toEqual({ loja: "1714", esperados: 0, emDia: 0 });
  });
});
