import { describe, expect, it } from "vitest";

import { lerOrdemFiltro, segmentosStatus, statusAoClicar, urlCasos } from "./barra-status";

describe("barra de status", () => {
  it("segmentos na ordem da lista, zerados inclusive, com percentual", () => {
    const s = segmentosStatus({ inicial: 25, recepcionado: 0, em_andamento_interno: 20, reavaliacao: 5, ouvidoria: 0, resolvido: 75 });
    expect(s.map((x) => x.status)).toEqual(["inicial", "recepcionado", "em_andamento_interno", "reavaliacao", "ouvidoria", "resolvido"]);
    expect(s.find((x) => x.status === "em_andamento_interno")).toEqual({ status: "em_andamento_interno", quantidade: 20, percentual: 16 });
    expect(s.find((x) => x.status === "recepcionado")?.quantidade).toBe(0);
  });

  it("sem casos: tudo zero", () => {
    expect(segmentosStatus({ inicial: 0, recepcionado: 0, em_andamento_interno: 0, reavaliacao: 0, ouvidoria: 0, resolvido: 0 }).every((x) => x.percentual === 0)).toBe(true);
  });

  it("clicar aplica o status; clicar de novo volta para Todos", () => {
    expect(statusAoClicar(undefined, "inicial")).toBe("inicial");
    expect(statusAoClicar("recepcionado", "inicial")).toBe("inicial");
    expect(statusAoClicar("inicial", "inicial")).toBeUndefined();
  });

  it("URL mantém os outros filtros e troca só o pedido", () => {
    const f = { filial: "1714" as const, busca: "maria", status: "inicial" as const, mostrarTeste: true };
    expect(urlCasos(f, { status: "resolvido" })).toBe("/casos?busca=maria&status=resolvido&filial=1714&mostrarTeste=1");
    expect(urlCasos(f, { status: undefined })).toBe("/casos?busca=maria&filial=1714&mostrarTeste=1");
    expect(urlCasos({}, { prazo: "vencido" })).toBe("/casos?prazo=vencido");
    expect(urlCasos({})).toBe("/casos");
  });
});

describe("urlCasos — prioridade e ordem", () => {
  it("prioridade= e ordem=prioridade entram na URL e saem com undefined", () => {
    const f = { aberto: true, prioridade: "urgente" as const, ordem: "prioridade" as const };
    expect(urlCasos(f)).toBe("/casos?prioridade=urgente&aberto=1&ordem=prioridade");
    expect(urlCasos(f, { prioridade: undefined })).toBe("/casos?aberto=1&ordem=prioridade");
    expect(urlCasos({}, { prioridade: "sem" })).toBe("/casos?prioridade=sem");
  });

  it("lerOrdemFiltro só aceita parado e prioridade", () => {
    expect([lerOrdemFiltro("parado"), lerOrdemFiltro("prioridade"), lerOrdemFiltro("x")]).toEqual(["parado", "prioridade", undefined]);
  });
});
