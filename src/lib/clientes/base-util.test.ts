import { describe, expect, it } from "vitest";

import { filtrosParaQuery, lerFiltros, linkFastzap, linkWhatsapp, montarCsv, montarMensagem, telefoneNacional } from "./base-util";

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
    ).toEqual({ loja: "1710", destino: "Orlando", tipo: "ingresso", valor_de: "1.000", valor_ate: "2500.50", embarque_de: "2026-12-01", futura: "1" });
  });

  it("campos de campanha só valem com a campanha certa; tipo inválido sai", () => {
    expect(lerFiltros({ camp: "adicional", ca_tipo: "aereo", ca_sem_tipo: "ingresso", cr_tipo: "hotel", tipo: "xpto" })).toEqual({
      camp: "adicional",
      ca_tipo: "aereo",
      ca_sem_tipo: "ingresso",
    });
    expect(lerFiltros({ ca_tipo: "aereo" })).toEqual({});
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
