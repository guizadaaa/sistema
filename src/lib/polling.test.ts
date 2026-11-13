import { describe, expect, it } from "vitest";

import { deveConsultar, INTERVALO_POLLING_MS } from "./polling";

describe("deveConsultar", () => {
  const agora = 1_000_000;

  it("não consulta com a aba em segundo plano, mesmo vencido", () => {
    expect(deveConsultar(false, agora - 10 * INTERVALO_POLLING_MS, agora, INTERVALO_POLLING_MS)).toBe(false);
  });

  it("não consulta antes de completar o intervalo", () => {
    expect(deveConsultar(true, agora - INTERVALO_POLLING_MS + 1, agora, INTERVALO_POLLING_MS)).toBe(false);
  });

  it("consulta com a aba visível e o intervalo vencido", () => {
    expect(deveConsultar(true, agora - INTERVALO_POLLING_MS, agora, INTERVALO_POLLING_MS)).toBe(true);
  });

  it("intervalo padrão de 2 minutos", () => {
    expect(INTERVALO_POLLING_MS).toBe(120_000);
  });
});
