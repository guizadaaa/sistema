import { describe, expect, it } from "vitest";

import { ordenarCasosParados } from "./metricas";

const caso = (id: string, status_atual: "inicial" | "recepcionado" | "resolvido") => ({
  id,
  protocolo: Number(id),
  cliente_nome: `Cliente ${id}`,
  status_atual,
});

describe("ordenarCasosParados", () => {
  it("exclui Resolvido e ordena pelo tempo na etapa atual (entrada mais recente de cada caso)", () => {
    const lista = [caso("1", "inicial"), caso("2", "resolvido"), caso("3", "recepcionado")];
    const historico = [
      // Caso 1: estava parado há muito tempo no status anterior, mas mudou há 1 dia — conta só a etapa atual.
      { caso_id: "1", entrou_em: "2026-01-01T00:00:00Z", duracao: "200 days 00:00:00" },
      { caso_id: "1", entrou_em: "2026-09-29T00:00:00Z", duracao: "1 day 00:00:00" },
      { caso_id: "2", entrou_em: "2026-01-01T00:00:00Z", duracao: "300 days 00:00:00" },
      { caso_id: "3", entrou_em: "2026-09-20T00:00:00Z", duracao: "10 days 00:00:00" },
    ];

    const resultado = ordenarCasosParados(lista, historico);

    expect(resultado.map((c) => c.id)).toEqual(["3", "1"]);
    expect(resultado).not.toContainEqual(expect.objectContaining({ id: "2" }));
  });

  it("não corta a lista — a paginação fica na tela", () => {
    const lista = Array.from({ length: 25 }, (_, i) => caso(String(i + 1), "inicial"));
    expect(ordenarCasosParados(lista, [])).toHaveLength(25);
  });
});
