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

describe("transfer (Consulta de Roteiro e Reserva)", () => {
  const aereo = { categoria: "TRANSPORTE AÉREO", receptivo: "Gol", servico: "Voo GOL Curitiba/Fortaleza - Aeroporto Pinto Martins" };
  const hotel = { categoria: "HOTEL", receptivo: "Hotel Praia Mar", servico: "Apartamento Standard" };

  it("caso real: pacote exclusivo Fortaleza (4.00018321.26111122, reserva 306400304) -> aéreo, hotel, passeio, transfer", () => {
    expect(
      calcularTiposServico({
        categoria_codigo: 4,
        tem_voo: true,
        descricao_roteiro: "FORTALEZA - 8 Dias 7 Noites",
        fornecedores: [
          aereo,
          hotel,
          {
            categoria: "TRANSPORTES COMPARTILHADOS",
            receptivo: "Receptivo Fortaleza",
            servico:
              "(In E Out) - Transporte Compartilhado De Chegada E Saída Do Aeroporto De Fortaleza Para Hotel Em Fortaleza + City Tour Em Fortaleza",
          },
        ],
      })
    ).toEqual(["aereo", "hotel", "passeio", "transfer"]); // ordem fixa de TIPOS_SERVICO
  });

  it("variações de pacote exclusivo", () => {
    expect(calcularTiposServico({ categoria_codigo: 4, fornecedores: [aereo] })).toEqual(["aereo"]);
    expect(
      calcularTiposServico({
        categoria_codigo: 4,
        fornecedores: [aereo, hotel, { categoria: "RECEPTIVO", servico: "Traslado Aeroporto/Hotel/Aeroporto" }],
      })
    ).toEqual(["aereo", "hotel", "transfer"]);
    expect(
      calcularTiposServico({
        categoria_codigo: 4,
        fornecedores: [
          aereo,
          hotel,
          { categoria: "RECEPTIVO", servico: "In/Out Regular Aeroporto - Hotel" },
          { categoria: "ATIVIDADE", servico: "Passeio De Buggy Pelas Dunas" },
        ],
      })
    ).toEqual(["aereo", "hotel", "passeio", "transfer"]); // ordem fixa de TIPOS_SERVICO
  });

  it("transfer individual/privativo", () => {
    expect(calcularTiposServico({ fornecedores: [{ categoria: "RECEPTIVO", servico: "Transfer Privativo Aeroporto/Hotel/Aeroporto" }] })).toEqual(["transfer"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "RECEPTIVO", servico: "Transporte Exclusivo Do Aeroporto Ao Resort" }] })).toEqual(["transfer"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "SERVICOS", servico: "Chegada E Saída - Serviço Individual" }] })).toEqual(["transfer"]);
  });

  it('"Transporte Aéreo" sozinho não vira transfer', () => {
    expect(calcularTiposServico({ fornecedores: [aereo] })).toEqual(["aereo"]);
    expect(calcularTiposServico({ fornecedores: [{ categoria: "TRANSPORTE AEREO", servico: "Voo Regular In/Out Aeroporto Hotel" }] })).toEqual(["aereo"]);
  });
});
