import { describe, expect, it } from "vitest";

import { corPrazoVigencia, descricaoDiasAteVencimento, diasAteVencimento, situacaoPrazoVigencia } from "./prazo";

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
