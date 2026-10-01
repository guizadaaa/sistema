import { describe, expect, it } from "vitest";

import {
  corPrazoVigencia,
  descricaoDiasAteVencimento,
  diasAteVencimento,
  prazoNaResolucao,
  situacaoPrazoVigencia,
} from "./prazo";

const HOJE = new Date(2026, 6, 25); // 25/07/2026

function dataEmDias(offset: number): string {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

describe("diasAteVencimento", () => {
  it("positivo quando o prazo ainda não chegou", () => {
    expect(diasAteVencimento(dataEmDias(10), HOJE)).toBe(10);
  });

  it("negativo quando já venceu", () => {
    expect(diasAteVencimento(dataEmDias(-5), HOJE)).toBe(-5);
  });

  it("zero no dia do vencimento", () => {
    expect(diasAteVencimento(dataEmDias(0), HOJE)).toBe(0);
  });
});

describe("situacaoPrazoVigencia", () => {
  it("vencido quando negativo", () => {
    expect(situacaoPrazoVigencia(dataEmDias(-1), HOJE)).toBe("vencido");
  });

  it("vencendo até 7 dias", () => {
    expect(situacaoPrazoVigencia(dataEmDias(7), HOJE)).toBe("vencendo");
  });

  it("normal acima de 7 dias", () => {
    expect(situacaoPrazoVigencia(dataEmDias(8), HOJE)).toBe("normal");
  });
});

describe("corPrazoVigencia", () => {
  it("vermelho quando vencido", () => {
    expect(corPrazoVigencia(dataEmDias(-1), HOJE)).toBe("vermelho");
  });

  it("vermelho de 0 a 3 dias", () => {
    expect(corPrazoVigencia(dataEmDias(0), HOJE)).toBe("vermelho");
    expect(corPrazoVigencia(dataEmDias(3), HOJE)).toBe("vermelho");
  });

  it("laranja de 4 a 7 dias", () => {
    expect(corPrazoVigencia(dataEmDias(4), HOJE)).toBe("laranja");
    expect(corPrazoVigencia(dataEmDias(7), HOJE)).toBe("laranja");
  });

  it("amarelo de 8 a 15 dias", () => {
    expect(corPrazoVigencia(dataEmDias(8), HOJE)).toBe("amarelo");
    expect(corPrazoVigencia(dataEmDias(15), HOJE)).toBe("amarelo");
  });

  it("verde acima de 15 dias", () => {
    expect(corPrazoVigencia(dataEmDias(16), HOJE)).toBe("verde");
  });
});

describe("descricaoDiasAteVencimento", () => {
  it("vence hoje", () => {
    expect(descricaoDiasAteVencimento(dataEmDias(0), HOJE)).toBe("Vence hoje");
  });

  it("vence em N dias (singular e plural)", () => {
    expect(descricaoDiasAteVencimento(dataEmDias(1), HOJE)).toBe("Vence em 1 dia");
    expect(descricaoDiasAteVencimento(dataEmDias(12), HOJE)).toBe("Vence em 12 dias");
  });

  it("vencido há N dias (singular e plural)", () => {
    expect(descricaoDiasAteVencimento(dataEmDias(-1), HOJE)).toBe("Vencido há 1 dia");
    expect(descricaoDiasAteVencimento(dataEmDias(-5), HOJE)).toBe("Vencido há 5 dias");
  });
});

describe("prazoNaResolucao", () => {
  it("resolvido antes do prazo: dias = prazo - resolução", () => {
    expect(prazoNaResolucao("2026-08-20", "2026-08-10T15:00:00Z")).toEqual({ antesDoPrazo: true, dias: 10 });
  });

  it("resolvido depois do prazo: dias = resolução - prazo", () => {
    expect(prazoNaResolucao("2026-08-20", "2026-08-23T15:00:00Z")).toEqual({ antesDoPrazo: false, dias: 3 });
  });

  it("resolvido no próprio dia do prazo conta como antes (0 dias)", () => {
    expect(prazoNaResolucao("2026-08-20", "2026-08-20T23:00:00Z")).toEqual({ antesDoPrazo: true, dias: 0 });
  });

  it("um dia depois do prazo já é depois (1 dia)", () => {
    expect(prazoNaResolucao("2026-08-20", "2026-08-21T12:00:00Z")).toEqual({ antesDoPrazo: false, dias: 1 });
  });

  it("usa o dia em São Paulo: 01:30 UTC do dia 21 ainda é dia 20 em Brasília", () => {
    expect(prazoNaResolucao("2026-08-20", "2026-08-21T01:30:00Z")).toEqual({ antesDoPrazo: true, dias: 0 });
  });

  it("o relógio para na resolução — não depende de hoje", () => {
    // Resolvido 5 dias antes de um prazo que já passou há muito tempo.
    expect(prazoNaResolucao("2025-01-10", "2025-01-05T12:00:00Z")).toEqual({ antesDoPrazo: true, dias: 5 });
  });

  it("conta dias certos atravessando virada de mês e horário de verão", () => {
    expect(prazoNaResolucao("2026-03-02", "2026-02-20T12:00:00Z")).toEqual({ antesDoPrazo: true, dias: 10 });
    expect(prazoNaResolucao("2025-10-31", "2026-01-05T12:00:00Z")).toEqual({ antesDoPrazo: false, dias: 66 });
  });
});
