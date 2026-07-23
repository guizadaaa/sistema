import { describe, expect, it } from "vitest";

import { proximosStatusValidos } from "./status";

describe("proximosStatusValidos", () => {
  it("oferece Reavaliação, Ouvidoria e Resolvido a partir de Em andamento interno, para admin", () => {
    expect(proximosStatusValidos("em_andamento_interno", true)).toEqual(["reavaliacao", "ouvidoria", "resolvido"]);
  });

  it("esconde Ouvidoria de quem não é admin, mantendo Reavaliação e Resolvido", () => {
    expect(proximosStatusValidos("em_andamento_interno", false)).toEqual(["reavaliacao", "resolvido"]);
  });

  it("Ouvidoria só avança para Resolvido", () => {
    expect(proximosStatusValidos("ouvidoria", true)).toEqual(["resolvido"]);
    expect(proximosStatusValidos("ouvidoria", false)).toEqual(["resolvido"]);
  });

  it("Reavaliação só avança para Resolvido", () => {
    expect(proximosStatusValidos("reavaliacao", true)).toEqual(["resolvido"]);
  });

  it("Resolvido não tem próximo status (não existe mais reabertura via Ouvidoria)", () => {
    expect(proximosStatusValidos("resolvido", true)).toEqual([]);
    expect(proximosStatusValidos("resolvido", false)).toEqual([]);
  });

  it("segue o fluxo linear inicial -> recepcionado -> em_andamento_interno", () => {
    expect(proximosStatusValidos("inicial", true)).toEqual(["recepcionado"]);
    expect(proximosStatusValidos("recepcionado", true)).toEqual(["em_andamento_interno"]);
  });
});
