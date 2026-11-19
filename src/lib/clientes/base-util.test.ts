import { describe, expect, it } from "vitest";

import {
  atalhosEmbarque,
  atalhosRecompra,
  estadoFrase,
  filtrosParaQuery,
  lerFiltros,
  linkFastzap,
  linkWhatsapp,
  montarCsv,
  montarMensagem,
  mostraViagemFutura,
  segundoPeriodo,
  telefoneNacional,
  tempoDesde,
} from "./base-util";

describe("lerFiltros", () => {
  it("aceita só chaves e valores válidos", () => {
    expect(
      lerFiltros({
        loja: "1710",
        destino: " Orlando ",
        tipo: "ingresso",
        valor_de: "1.000",
        valor_ate: "2500,50",
        embarque_de: "2026-12-01",
        embarque_ate: "ontem",
        futura: "1",
        hack: "x",
        vendedor: "todos",
      })
    ).toEqual({
      // destino/tipo/embarque (antigos) migram para a frase da Venda adicional; com a
      // frase preenchida, "Só com viagem futura" não vale.
      loja: "1710", ca_destino: "Orlando", ca_tipo: "ingresso", valor_de: "1.000", valor_ate: "2500.50", ca_de: "2026-12-01", camp: "adicional",
    });
  });

  it("campos de campanha só valem com a campanha certa; tipo inválido sai", () => {
    expect(lerFiltros({ camp: "adicional", ca_tipo: "aereo", ca_sem_tipo: "ingresso", cr_tipo: "hotel", tipo: "xpto" })).toEqual({
      camp: "adicional",
      ca_tipo: "aereo",
      ca_sem_tipo: "ingresso",
    });
    // Sem camp, abre em Venda adicional.
    expect(lerFiltros({ ca_tipo: "aereo" })).toEqual({ camp: "adicional", ca_tipo: "aereo" });
    expect(lerFiltros({ camp: "recompra", ca_tipo: "aereo", cr_tipo: "hotel" })).toEqual({ camp: "recompra", cr_tipo: "hotel" });
  });

  it("filtro salvo com a antiga campanha \"Nenhuma\" abre em Venda adicional e mantém loja, vendedor e valores", () => {
    expect(lerFiltros({ camp: "", loja: "1714", vendedor: "u:abc", valor_de: "500", total_ate: "9000" })).toEqual({
      camp: "adicional",
      loja: "1714",
      vendedor: "u:abc",
      valor_de: "500",
      total_ate: "9000",
    });
    expect(lerFiltros({ camp: "nenhuma" })).toEqual({ camp: "adicional" });
  });

  it("filtrosParaQuery monta a URL com página", () => {
    expect(filtrosParaQuery({ camp: "adicional", ca_tipo: "aereo" }, { pagina: "2" })).toBe("camp=adicional&ca_tipo=aereo&pagina=2");
  });
});

describe("mensagem, WhatsApp e CSV", () => {
  it("troca as variáveis", () => {
    expect(
      montarMensagem("Oi {nome}! Sua viagem para {destino} em {data_embarque}. {vendedor} {outra}", {
        nome: "Rodrigo",
        destino: "ORLANDO",
        vendedor: "Alejandra",
        data_embarque: "2027-01-10",
      })
    ).toBe("Oi Rodrigo! Sua viagem para ORLANDO em 10/01/2027. Alejandra {outra}");
  });

  it("wa.me com 55 para número nacional", () => {
    expect(linkWhatsapp("41 99999-0000")).toBe("https://wa.me/5541999990000");
    expect(linkWhatsapp("+55 (41) 99999-0000")).toBe("https://wa.me/5541999990000");
    expect(linkWhatsapp("9999")).toBeNull();
  });

  it("CSV com ; aspas e decimal com vírgula", () => {
    expect(montarCsv(["nome", "valor"], [["Ana; Bia", 10.5], ['Diz "oi"', null]])).toBe(
      '﻿nome;valor\r\n"Ana; Bia";10,5\r\n"Diz ""oi""";\r\n'
    );
  });
});

describe("FastZap", () => {
  it("telefone nacional sem o 55", () => {
    expect(telefoneNacional("41 99280-1401")).toBe("41992801401");
    expect(telefoneNacional("+55 (41) 99280-1401")).toBe("41992801401");
    expect(telefoneNacional("4121091700")).toBe("4121091700");
    expect(telefoneNacional("9280-1401")).toBeNull();
  });
  it("link com nome e telefone no #, legível de volta (acentos)", () => {
    const url = linkFastzap("José Ávila", "41 99280-1401")!;
    expect(url.startsWith("https://gestor.fastzap.chat/chat/#aura-novo=")).toBe(true);
    const b64 = decodeURIComponent(url.split("aura-novo=")[1]);
    const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
    expect(json).toEqual({ nome: "José Ávila", telefone: "41992801401" });
    expect(linkFastzap("X", "123")).toBeNull();
  });
});

describe("tempoDesde", () => {
  it("anos, meses e dias de calendário", () => {
    expect(tempoDesde("2024-08-03", "2026-11-18")).toBe("2 anos, 3 meses, 15 dias");
    expect(tempoDesde("2025-11-28", "2026-11-18")).toBe("11 meses, 21 dias");
  });
  it("partes zeradas não aparecem", () => {
    expect(tempoDesde("2026-08-13", "2026-11-18")).toBe("3 meses, 5 dias");
    expect(tempoDesde("2025-11-06", "2026-11-18")).toBe("1 ano, 12 dias");
    expect(tempoDesde("2026-11-10", "2026-11-18")).toBe("8 dias");
    expect(tempoDesde("2024-11-18", "2026-11-18")).toBe("2 anos");
  });
  it("singular", () => {
    expect(tempoDesde("2025-10-17", "2026-11-18")).toBe("1 ano, 1 mês, 1 dia");
  });
  it("no mesmo dia: hoje; futura ou vazia: nada", () => {
    expect(tempoDesde("2026-11-18", "2026-11-18")).toBe("hoje");
    expect(tempoDesde("2026-11-19", "2026-11-18")).toBe("");
    expect(tempoDesde(null, "2026-11-18")).toBe("");
  });
  it("fim de mês: 31/01 → 28/02 é 1 mês; em ano bissexto só em 29/02", () => {
    expect(tempoDesde("2025-01-31", "2025-02-28")).toBe("1 mês");
    expect(tempoDesde("2024-01-31", "2024-02-28")).toBe("28 dias");
    expect(tempoDesde("2024-01-31", "2024-02-29")).toBe("1 mês");
    expect(tempoDesde("2024-01-31", "2024-03-01")).toBe("1 mês, 1 dia");
    expect(tempoDesde("2024-02-29", "2025-02-28")).toBe("1 ano");
    expect(tempoDesde("2025-12-31", "2026-01-30")).toBe("30 dias");
  });
});

describe("frase da campanha", () => {
  it("vazia = base geral; parcial sem 'não comprou' = incompleta; com ele = completa", () => {
    expect(estadoFrase({ camp: "adicional" })).toBe("vazia");
    expect(estadoFrase({ camp: "adicional", ca_tipo: "aereo", ca_destino: "orlando" })).toBe("incompleta");
    expect(estadoFrase({ camp: "adicional", ca_tipo: "aereo", ca_sem_tipo: "ingresso" })).toBe("completa");
    expect(estadoFrase({ camp: "recompra" })).toBe("vazia");
    expect(estadoFrase({ camp: "recompra", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31" })).toBe("incompleta");
    expect(estadoFrase({ camp: "recompra", cr_a_de: "2025-01-01", cr_sem: "nada" })).toBe("completa");
  });

  it("'Só com viagem futura': frase vazia e Recompra sim; Venda adicional preenchida não", () => {
    expect(mostraViagemFutura({ camp: "adicional" })).toBe(true);
    expect(mostraViagemFutura({ camp: "recompra", cr_tipo: "aereo", cr_sem: "nada" })).toBe(true);
    expect(mostraViagemFutura({ camp: "adicional", ca_tipo: "aereo" })).toBe(false);
    expect(lerFiltros({ camp: "adicional", ca_tipo: "aereo", ca_sem_tipo: "ingresso", futura: "1" }).futura).toBeUndefined();
    expect(lerFiltros({ camp: "recompra", cr_tipo: "aereo", cr_sem: "nada", futura: "1" }).futura).toBe("1");
    expect(lerFiltros({ futura: "1" }).futura).toBe("1");
  });

  it("Recompra: 'não comprou' aceita tipo ou nada; mesmo destino é 1", () => {
    expect(lerFiltros({ camp: "recompra", cr_sem: "nada", cr_mesmo_destino: "1" })).toEqual({ camp: "recompra", cr_sem: "nada", cr_mesmo_destino: "1" });
    expect(lerFiltros({ camp: "recompra", cr_sem: "xpto", cr_mesmo_destino: "sim" })).toEqual({ camp: "recompra" });
  });
});

describe("filtros salvos antigos", () => {
  it("Venda adicional: destino, tipo e embarque vão para a frase; data da compra é descartada; fica incompleta", () => {
    const f = lerFiltros({ camp: "adicional", destino: "Orlando", tipo: "aereo", embarque_de: "2026-12-01", embarque_ate: "2027-01-31", compra_de: "2026-01-01", loja: "1710" });
    expect(f).toEqual({ camp: "adicional", ca_destino: "Orlando", ca_tipo: "aereo", ca_de: "2026-12-01", ca_ate: "2027-01-31", loja: "1710" });
    expect(estadoFrase(f)).toBe("incompleta");
  });
  it("antiga 'Nenhuma' com destino: abre em Venda adicional com o destino na frase", () => {
    expect(lerFiltros({ camp: "", destino: "Natal", vendedor: "grupo:ex" })).toEqual({ camp: "adicional", ca_destino: "Natal", vendedor: "grupo:ex" });
  });
  it("Recompra: data da compra → 1º período; embarque descartado; escopo → 'não comprou'", () => {
    expect(lerFiltros({ camp: "recompra", compra_de: "2025-01-01", compra_ate: "2025-12-31", embarque_de: "2026-01-01", cr_escopo: "nada", cr_b_de: "2026-01-01" })).toEqual({
      camp: "recompra", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31", cr_sem: "nada", cr_b_de: "2026-01-01",
    });
    expect(lerFiltros({ camp: "recompra", cr_tipo: "cruzeiro", cr_destino: "Caribe", cr_escopo: "mesmo" })).toEqual({
      camp: "recompra", cr_tipo: "cruzeiro", cr_destino: "Caribe", cr_sem: "cruzeiro", cr_mesmo_destino: "1",
    });
    // Escopo sozinho (frase vazia) não preenche a frase.
    expect(lerFiltros({ camp: "recompra", cr_escopo: "nada" })).toEqual({ camp: "recompra" });
  });
});

describe("atalhos e 2º período", () => {
  const HOJE = "2026-11-19";
  it("Venda adicional: próx. 30, 60, 90 dias e 6 meses a partir de hoje", () => {
    expect(atalhosEmbarque(HOJE).map((a) => [a.rotulo, a.de, a.ate])).toEqual([
      ["próx. 30 dias", HOJE, "2026-12-19"],
      ["60 dias", HOJE, "2027-01-18"],
      ["90 dias", HOJE, "2027-02-17"],
      ["6 meses", HOJE, "2027-05-19"],
    ]);
  });
  it("Recompra: ano passado e mesmo período do ano passado (3 meses)", () => {
    expect(atalhosRecompra(HOJE).map((a) => [a.rotulo, a.de, a.ate])).toEqual([
      ["ano passado", "2025-01-01", "2025-12-31"],
      ["mesmo período do ano passado", "2025-11-19", "2026-02-18"],
    ]);
  });
  it("2º período: do dia seguinte ao fim do 1º até hoje", () => {
    expect(segundoPeriodo("2025-12-31", HOJE)).toEqual({ de: "2026-01-01", ate: HOJE });
    expect(segundoPeriodo(HOJE, HOJE)).toBeNull();
    expect(segundoPeriodo(undefined, HOJE)).toBeNull();
  });
});
