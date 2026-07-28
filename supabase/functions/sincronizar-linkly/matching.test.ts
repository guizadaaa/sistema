import { describe, expect, it } from "vitest";

import { encontrarLinkCorrespondente, extrairContagemDeCliques, extrairLista, extrairWorkspaceId } from "./matching";

// Resposta real da API do Linkly (list_links), workspace 388298 (loja 1710),
// capturada em 28/07 via net.http_get direto no SQL Editor — não uma
// suposição. Só os campos que a lógica de correspondência usa (mais alguns
// de ruído pra provar que o resto é ignorado) — o payload completo tinha 6
// links, mantidos aqui 2 representativos.
const RESPOSTA_REAL_LIST_LINKS = {
  links: [
    {
      clicks_total: 1,
      full_url: "https://linkly.link/2nlqB",
      url: "https://chat.whatsapp.com/EFPa2OKv3at8DrugA7NwVG",
      slug: null,
      id: 41414647,
      name: "dayane",
      workspace_id: 388298,
      clicks_today: 0,
      clicks_thirty_days: 1,
    },
    {
      clicks_total: 11,
      full_url: "https://linkly.link/2nltE",
      url: "https://chat.whatsapp.com/EFPa2OKv3at8DrugA7NwVG",
      slug: null,
      id: 41414836,
      name: "yasmin",
      workspace_id: 388298,
      clicks_today: 0,
      clicks_thirty_days: 11,
    },
    {
      clicks_total: 0,
      full_url: "https://linkly.link/2nlt5",
      url: "https://chat.whatsapp.com/EFPa2OKv3at8DrugA7NwVG",
      slug: null,
      id: 41414827,
      name: "adriana",
      workspace_id: 388298,
      clicks_today: 0,
      clicks_thirty_days: 0,
    },
  ],
  page_size: 1000,
  page_number: 1,
  total_entries: 6,
  total_pages: 1,
  total_rows: 6,
  workspace_link_count: 6,
};

describe("extrairLista", () => {
  it("lê o array de dentro de payload.links (não é um array na raiz)", () => {
    expect(extrairLista(RESPOSTA_REAL_LIST_LINKS)).toHaveLength(3);
  });

  it("retorna [] se a resposta não tiver .links", () => {
    expect(extrairLista({ ok: true })).toEqual([]);
    expect(extrairLista(null)).toEqual([]);
  });
});

describe("encontrarLinkCorrespondente", () => {
  const links = extrairLista(RESPOSTA_REAL_LIST_LINKS);

  it("casa por id quando o Adm Master cadastrou o identificador exato do Linkly", () => {
    const encontrado = encontrarLinkCorrespondente(links, "41414647", "https://qualquer-outra-coisa.example");
    expect(encontrado?.name).toBe("dayane");
  });

  it("casa por full_url (fallback) quando o linkly_link_id cadastrado não bate com nenhum id", () => {
    const encontrado = encontrarLinkCorrespondente(links, "nao-sei-o-id", "https://linkly.link/2nltE");
    expect(encontrado?.name).toBe("yasmin");
  });

  it("ignora barra final e maiúsculas/minúsculas ao comparar a URL curta", () => {
    const encontrado = encontrarLinkCorrespondente(links, "nao-sei-o-id", "HTTPS://LINKLY.LINK/2nlqB/");
    expect(encontrado?.name).toBe("dayane");
  });

  it("retorna null quando não bate nem por id nem por full_url", () => {
    expect(encontrarLinkCorrespondente(links, "id-inexistente", "https://linkly.link/nao-existe")).toBeNull();
  });

  it("NAO casa por slug (sempre null nesta API) nem pelo campo url (é o destino, não a URL curta)", () => {
    // link.url aponta pro WhatsApp — se a correspondência usasse esse campo
    // por engano, "https://chat.whatsapp.com/EFPa2OKv3at8DrugA7NwVG" bateria
    // com qualquer um dos 3 links (todos compartilham o mesmo destino).
    const encontrado = encontrarLinkCorrespondente(links, "id-inexistente", "https://chat.whatsapp.com/EFPa2OKv3at8DrugA7NwVG");
    expect(encontrado).toBeNull();
  });
});

describe("extrairContagemDeCliques", () => {
  it("lê clicks_total (campo real confirmado)", () => {
    const [dayane, yasmin, adriana] = extrairLista(RESPOSTA_REAL_LIST_LINKS);
    expect(extrairContagemDeCliques(dayane)).toBe(1);
    expect(extrairContagemDeCliques(yasmin)).toBe(11);
    expect(extrairContagemDeCliques(adriana)).toBe(0);
  });

  it("retorna null (não 0) quando nenhum campo de contagem existe — nunca grava total errado", () => {
    expect(extrairContagemDeCliques({ nome: "sem cliques nenhum" })).toBeNull();
  });

  it("usa os nomes antigos como fallback defensivo se clicks_total não existir", () => {
    expect(extrairContagemDeCliques({ clicks: 5 })).toBe(5);
  });
});

describe("extrairWorkspaceId (não afetado por este ajuste — já funcionava)", () => {
  it("lê o id do primeiro workspace da lista", () => {
    expect(extrairWorkspaceId({ workspaces: [{ id: 388298 }] })).toBe("388298");
  });

  it("retorna null se a lista vier vazia", () => {
    expect(extrairWorkspaceId({ workspaces: [] })).toBeNull();
  });
});
