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
        produto: "4",
        hack: "x",
        vendedor: "todos",
      })
    ).toEqual({
      // destino/tipo/embarque antigos migram para a frase da Venda adicional; futura sai.
      loja: "1710", ca_destino: "Orlando", servico: "ingresso", valor_de: "1.000", valor_ate: "2500.50", ca_de: "2026-12-01", produto: "4", camp: "adicional",
    });
  });

  it("campos de campanha só valem com a campanha certa; serviço/produto inválidos saem", () => {
    expect(lerFiltros({ camp: "adicional", servico: "aereo", ca_sem_tipo: "ingresso", cr_sem: "nada", produto: "6" })).toEqual({
      camp: "adicional",
      servico: "aereo",
      ca_sem_tipo: "ingresso",
    });
    expect(lerFiltros({ servico: "xpto", produto: "12" })).toEqual({ camp: "adicional" });
    expect(lerFiltros({ camp: "recompra", ca_destino: "Natal", produto: "9", servico: "hotel" })).toEqual({ camp: "recompra", produto: "9", servico: "hotel" });
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
    expect(filtrosParaQuery({ camp: "adicional", servico: "aereo" }, { pagina: "2" })).toBe("camp=adicional&servico=aereo&pagina=2");
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
  it("vazia (viagens futuras / clientes parados); parcial sem 'não comprou' = incompleta; com ele = completa", () => {
    expect(estadoFrase({ camp: "adicional" })).toBe("vazia");
    expect(estadoFrase({ camp: "adicional", produto: "4", ca_destino: "orlando" })).toBe("incompleta");
    expect(estadoFrase({ camp: "adicional", servico: "aereo", ca_sem_tipo: "ingresso" })).toBe("completa");
    expect(estadoFrase({ camp: "recompra" })).toBe("vazia");
    expect(estadoFrase({ camp: "recompra", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31" })).toBe("incompleta");
    expect(estadoFrase({ camp: "recompra", cr_a_de: "2025-01-01", cr_sem: "nada" })).toBe("completa");
  });

  it("Recompra: 'não comprou' aceita serviço ou nada; mesmo destino é 1", () => {
    expect(lerFiltros({ camp: "recompra", cr_sem: "nada", cr_mesmo_destino: "1" })).toEqual({ camp: "recompra", cr_sem: "nada", cr_mesmo_destino: "1" });
    expect(lerFiltros({ camp: "recompra", cr_sem: "xpto", cr_mesmo_destino: "sim" })).toEqual({ camp: "recompra" });
  });
});

describe("filtros salvos antigos", () => {
  it("Venda adicional: destino, tipo (→ serviço) e embarque vão para a frase; data da compra é descartada; fica incompleta", () => {
    const f = lerFiltros({ camp: "adicional", destino: "Orlando", tipo: "aereo", embarque_de: "2026-12-01", embarque_ate: "2027-01-31", compra_de: "2026-01-01", loja: "1710" });
    expect(f).toEqual({ camp: "adicional", ca_destino: "Orlando", servico: "aereo", ca_de: "2026-12-01", ca_ate: "2027-01-31", loja: "1710" });
    expect(estadoFrase(f)).toBe("incompleta");
    expect(lerFiltros({ camp: "adicional", ca_tipo: "aereo", ca_sem_tipo: "ingresso" })).toEqual({ camp: "adicional", servico: "aereo", ca_sem_tipo: "ingresso" });
  });
  it("antiga 'Nenhuma' com destino: abre em Venda adicional com o destino na frase", () => {
    expect(lerFiltros({ camp: "", destino: "Natal", vendedor: "grupo:ex" })).toEqual({ camp: "adicional", ca_destino: "Natal", vendedor: "grupo:ex" });
  });
  it("Recompra: 1º período antigo vale como período de retorno; 2º período (datas) descartado → 'depois de voltar'", () => {
    expect(lerFiltros({ camp: "recompra", cr_tipo: "aereo", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31", cr_sem: "nada", cr_b_de: "2026-01-01", cr_b_ate: "2026-11-19", futura: "1" })).toEqual({
      camp: "recompra", servico: "aereo", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31", cr_sem: "nada",
    });
    expect(lerFiltros({ camp: "recompra", compra_de: "2025-01-01", compra_ate: "2025-12-31", embarque_de: "2026-01-01", cr_escopo: "nada" })).toEqual({
      camp: "recompra", cr_a_de: "2025-01-01", cr_a_ate: "2025-12-31", cr_sem: "nada",
    });
    expect(lerFiltros({ camp: "recompra", cr_tipo: "cruzeiro", cr_destino: "Caribe", cr_escopo: "mesmo" })).toEqual({
      camp: "recompra", servico: "cruzeiro", cr_destino: "Caribe", cr_sem: "cruzeiro", cr_mesmo_destino: "1",
    });
    expect(lerFiltros({ camp: "recompra", cr_escopo: "nada" })).toEqual({ camp: "recompra" });
  });
});

describe("atalhos", () => {
  const HOJE = "2026-11-26";
  it("Venda adicional: de amanhã (nunca data passada) até 30, 60, 90 dias ou 6 meses", () => {
    expect(atalhosEmbarque(HOJE).map((a) => [a.rotulo, a.de, a.ate])).toEqual([
      ["próx. 30 dias", "2026-11-27", "2026-12-26"],
      ["60 dias", "2026-11-27", "2027-01-25"],
      ["90 dias", "2026-11-27", "2027-02-24"],
      ["6 meses", "2026-11-27", "2027-05-26"],
    ]);
  });
  it("Recompra (data de retorno, até ontem): últimos 30/90 dias, 6 meses, 1 ano, mesmo período do ano passado", () => {
    expect(atalhosRecompra(HOJE).map((a) => [a.rotulo, a.de, a.ate])).toEqual([
      ["últimos 30 dias", "2026-10-27", "2026-11-25"],
      ["90 dias", "2026-08-28", "2026-11-25"],
      ["6 meses", "2026-05-26", "2026-11-25"],
      ["1 ano", "2025-11-26", "2026-11-25"],
      ["mesmo período do ano passado", "2025-11-26", "2026-02-25"],
    ]);
  });
});
