import { describe, expect, it } from "vitest";

import { diaUtilAnterior, ehDiaUtil, feriadoDoDia, type Feriado } from "./dia-util";

const feriados: Feriado[] = [
  { data: "2026-11-20", nome: "Consciência Negra", abrangencia: "nacional", filial: null, facultativo: false },
  { data: "2026-09-08", nome: "Nossa Senhora da Luz (Curitiba)", abrangencia: "municipal", filial: "1710", facultativo: false },
  { data: "2026-09-08", nome: "Nossa Senhora da Luz (Curitiba)", abrangencia: "municipal", filial: "1714", facultativo: false },
  { data: "2026-03-19", nome: "São José (São José dos Pinhais)", abrangencia: "municipal", filial: "1730", facultativo: false },
  { data: "2026-06-04", nome: "Corpus Christi", abrangencia: "nacional", filial: null, facultativo: true },
];

describe("ehDiaUtil", () => {
  it("segunda a sexta comum é dia útil; sábado e domingo não", () => {
    expect(ehDiaUtil("2026-11-18", "1710", feriados)).toBe(true); // quarta
    expect(ehDiaUtil("2026-11-21", "1710", feriados)).toBe(false); // sábado
    expect(ehDiaUtil("2026-11-22", "1710", feriados)).toBe(false); // domingo
  });

  it("feriado nacional não é dia útil em nenhuma filial", () => {
    for (const f of ["1710", "1714", "1730"]) expect(ehDiaUtil("2026-11-20", f, feriados)).toBe(false);
  });

  it("feriado municipal vale só para a filial dele", () => {
    expect(ehDiaUtil("2026-09-08", "1710", feriados)).toBe(false);
    expect(ehDiaUtil("2026-09-08", "1714", feriados)).toBe(false);
    expect(ehDiaUtil("2026-09-08", "1730", feriados)).toBe(true);
    expect(ehDiaUtil("2026-03-19", "1730", feriados)).toBe(false);
    expect(ehDiaUtil("2026-03-19", "1710", feriados)).toBe(true);
  });

  it("ponto facultativo também não cobra", () => {
    expect(ehDiaUtil("2026-06-04", "1714", feriados)).toBe(false);
  });

  it("feriadoDoDia mostra o nome; sem filial (visão geral) pega qualquer filial", () => {
    expect(feriadoDoDia("2026-03-19", "1730", feriados)?.nome).toBe("São José (São José dos Pinhais)");
    expect(feriadoDoDia("2026-03-19", "1710", feriados)).toBeNull();
    expect(feriadoDoDia("2026-03-19", null, feriados)?.nome).toBe("São José (São José dos Pinhais)");
  });

  it("dia útil anterior pula fim de semana e feriado", () => {
    expect(diaUtilAnterior("2026-11-23", "1710", feriados)).toBe("2026-11-19"); // seg -> pula dom, sáb, sex 20 (feriado)
    expect(diaUtilAnterior("2026-11-18", "1710", feriados)).toBe("2026-11-17");
  });
});
