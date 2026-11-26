import { describe, expect, it } from "vitest";

import type { CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";

import { ariaNumero, gruposPorVendedor, hrefNumero, linhasPorFilial, somar, tempoNaEtapa, type ContagemCasos } from "./tabela-status";

const c = (filial: ContagemCasos["filial"], dono: string, status: ContagemCasos["status"], total: number, vencidos = 0, vencem5 = 0): ContagemCasos => ({
  filial, dono, status, total, vencidos, vencem5,
});
const contagens = [
  c("1710", "ana", "inicial", 2, 1),
  c("1710", "ana", "resolvido", 5),
  c("1710", "jean", "em_andamento_interno", 1, 0, 1), // caso antigo na 1710 de quem foi para a 1730
  c("1714", "bia", "em_andamento_interno", 3, 2),
  c("1714", "sol", "inicial", 1),
  c("1730", "jean", "reavaliacao", 4, 0, 2),
  c("1730", "zeca", "ouvidoria", 1),
];
const candidatos: CandidatoVendedor[] = [
  { id: "ana", nome: "Ana", filial: "1710", ativo: true, filiaisCasos: ["1710"] },
  { id: "jean", nome: "Jean", filial: "1730", ativo: true, filiaisCasos: ["1710", "1730"] },
  { id: "bia", nome: "Bia", filial: "1714", ativo: true, filiaisCasos: ["1714"] },
  { id: "sol", nome: "Sol", filial: "1714", ativo: false, filiaisCasos: ["1714"] },
  { id: "zeca", nome: "Zeca", filial: "1730", ativo: true, filiaisCasos: ["1730"] },
];
const lojas = ["1710", "1714", "1730"] as const;
const rotulo = (l: string) => `Loja ${l}`;

describe("tabela status × filial/vendedor", () => {
  it("Total = soma das filiais = soma dos vendedores", () => {
    const total = somar(contagens);
    const filiais = linhasPorFilial(contagens, candidatos, lojas, rotulo);
    const vendedores = gruposPorVendedor(contagens, candidatos, lojas, rotulo).flatMap((g) => g.linhas);
    for (const chave of ["inicial", "recepcionado", "em_andamento_interno", "reavaliacao", "ouvidoria", "resolvido"] as const) {
      expect(filiais.reduce((s, l) => s + l.numeros.porStatus[chave], 0)).toBe(total.porStatus[chave]);
      expect(vendedores.reduce((s, l) => s + l.numeros.porStatus[chave], 0)).toBe(total.porStatus[chave]);
    }
    expect(total.emAberto).toBe(12);
    expect(filiais.reduce((s, l) => s + l.numeros.emAberto, 0)).toBe(12);
    expect(vendedores.reduce((s, l) => s + l.numeros.emAberto, 0)).toBe(12);
    expect(total.porStatus.resolvido).toBe(5);
  });

  it("Em aberto e vencidos não contam resolvidos (vêm só das linhas não resolvidas)", () => {
    const n = somar([c("1710", "x", "resolvido", 9, 0, 0), c("1710", "x", "inicial", 1, 1, 0)]);
    expect(n.emAberto).toBe(1);
    expect(n.vencidos).toBe(1);
  });

  it("por filial: N vendedores = equipe ativa da loja", () => {
    const f = linhasPorFilial(contagens, candidatos, lojas, rotulo);
    expect(f.map((l) => [l.rotulo, l.subtitulo])).toEqual([
      ["Loja 1710", "1 vendedor"],
      ["Loja 1714", "1 vendedor"],
      ["Loja 1730", "2 vendedores"],
    ]);
  });

  it("por vendedor: agrupado pela loja do caso, alfabético, com 'outra loja' e 'inativo'", () => {
    const g = gruposPorVendedor(contagens, candidatos, lojas, rotulo);
    expect(g.map((x) => [x.titulo, x.linhas.map((l) => `${l.rotulo}${l.etiqueta ? ` (${l.etiqueta})` : ""}`)])).toEqual([
      ["Loja 1710", ["Ana", "Jean (outra loja)"]],
      ["Loja 1714", ["Bia", "Sol (inativo)"]],
      ["Loja 1730", ["Jean", "Zeca"]],
    ]);
  });

  it("links com os filtros da tela de Casos", () => {
    expect(hrefNumero({}, "inicial")).toBe("/casos?status=inicial");
    expect(hrefNumero({ filial: "1714" }, "inicial")).toBe("/casos?status=inicial&filial=1714");
    expect(hrefNumero({ filial: "1730", vendedor: "jean" }, "em_andamento_interno")).toBe("/casos?status=em_andamento_interno&filial=1730&vendedor=jean");
    expect(hrefNumero({ filial: "1714" }, "aberto")).toBe("/casos?filial=1714&aberto=1");
    expect(hrefNumero({ filial: "1714" }, "resolvido")).toBe("/casos?status=resolvido&filial=1714");
  });

  it("aria-label e tempo na etapa", () => {
    expect(ariaNumero({ filial: "1714", rotulo: "x" }, "inicial", 1)).toBe("Inicial: 1 caso na filial 1714");
    expect(ariaNumero({ filial: "1730", vendedor: "jean", rotulo: "Jean" }, "aberto", 3)).toBe("Em aberto: 3 casos de Jean (1730)");
    expect(ariaNumero({ rotulo: "Total" }, "resolvido", 10)).toBe("Resolvido: 10 casos no total");
    const agora = new Date("2026-11-26T12:00:00Z");
    expect(tempoNaEtapa("2026-11-26T08:00:00Z", agora)).toBe("Menos de 1 dia");
    expect(tempoNaEtapa("2026-11-25T08:00:00Z", agora)).toBe("1 dia");
    expect(tempoNaEtapa("2026-11-06T12:00:00Z", agora)).toBe("20 dias");
  });
});
