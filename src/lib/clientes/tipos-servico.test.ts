import { describe, expect, it } from "vitest";

import { calcularTiposServico, noitesDaDescricao } from "./tipos-servico";

describe("calcularTiposServico", () => {
  it("ingresso Disney (categoria ATIVIDADE, excursão 9.x, sem voo) -> só ingresso", () => {
    expect(
      calcularTiposServico({
        tipo_produto: "PRODUTO FÁCIL",
        descricao_roteiro: "DISNEY - PARIS - 1 Dias 0 Noites",
        tem_voo: false,
        categoria_codigo: 9,
        fornecedores: [
          {
            categoria: "ATIVIDADE",
            receptivo: "9540738 - Disneyland Paris",
            servico: "59058422 - Disneyland Paris · Ingresso Datado De 1 Dia / 1 Parque",
          },
        ],
      })
    ).toEqual(["ingresso"]);
  });

  it('passeio "1 Dias 0 Noites" -> passeio, sem hotel', () => {
    expect(
      calcularTiposServico({
        descricao_roteiro: "BUENOS AIRES - 1 Dias 0 Noites",
        fornecedores: [{ categoria: "ATIVIDADE", servico: "City Tour Buenos Aires" }],
      })
    ).toEqual(["passeio"]);
  });

  it("hotel pelas noites da descrição e pela categoria", () => {
    expect(calcularTiposServico({ descricao_roteiro: "ORLANDO - 8 Dias 7 Noites", fornecedores: [] })).toEqual(["hotel"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "HOSPEDAGEM", servico: "Quarto duplo" }] })).toEqual(["hotel"]);
  });

  it("aéreo com voo, pela categoria do fornecedor e pela categoria_codigo sem fornecedores", () => {
    expect(calcularTiposServico({ tem_voo: true, fornecedores: [] })).toEqual(["aereo"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "AÉREO" }] })).toEqual(["aereo"]);
    expect(calcularTiposServico({ categoria_codigo: 5 })).toEqual(["aereo"]);
    expect(calcularTiposServico({ categoria_codigo: 3 })).toEqual(["aereo"]);
  });

  it("transfer pela categoria ou pelo serviço (TRASLADO)", () => {
    expect(calcularTiposServico({ fornecedores: [{ categoria: "TRANSFER", servico: "Aeroporto x Hotel" }] })).toEqual(["transfer"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "SERVIÇOS", servico: "Traslado In/Out" }] })).toEqual(["transfer"]);
  });

  it("pacote completo: aéreo + hotel + ingresso + transfer + seguro, na ordem fixa", () => {
    expect(
      calcularTiposServico({
        tem_voo: true,
        tem_apolice: true,
        descricao_roteiro: "ORLANDO - 10 Dias 9 Noites",
        fornecedores: [
          { categoria: "ATIVIDADE", servico: "Ingresso Parque Magic Kingdom" },
          { categoria: "TRANSFER", servico: "Transfer regular" },
        ],
      })
    ).toEqual(["aereo", "hotel", "ingresso", "transfer", "seguro"]);
  });

  it("cruzeiro (categoria_codigo 8 ou fornecedor) e carro (locação)", () => {
    expect(calcularTiposServico({ categoria_codigo: 8 })).toEqual(["cruzeiro"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "MARITIMO", receptivo: "MSC Cruzeiros" }] })).toEqual(["cruzeiro"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "LOCAÇÃO DE VEÍCULOS" }] })).toEqual(["carro"]);
  });

  it("sem dado nenhum -> lista vazia", () => {
    expect(calcularTiposServico({})).toEqual([]);
  });
});

describe("noitesDaDescricao", () => {
  it("lê o número de noites", () => {
    expect(noitesDaDescricao("DISNEY - PARIS - 1 Dias 0 Noites")).toBe(0);
    expect(noitesDaDescricao("Orlando 8 dias 7 noites")).toBe(7);
    expect(noitesDaDescricao("1 NOITE")).toBe(1);
    expect(noitesDaDescricao("Ingresso")).toBeNull();
  });
});
