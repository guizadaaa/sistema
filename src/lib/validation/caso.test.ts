import { describe, expect, it } from "vitest";

import { casoSchema } from "./caso";

const COMUNS = {
  vendedorDono: "00000000-0000-4000-8000-000000000001",
  contratoNumero: "17100000000001",
  clienteNome: "Cliente",
  clienteCpf: "111.444.777-35",
  prazoVigencia: "2026-12-31",
};

describe("casoSchema — contrato de origem", () => {
  it("cancelamento: opcional (vazio vira não informado) e com máscara removida", () => {
    const base = { ...COMUNS, tipoCaso: "cancelamento", motivo: "pedido_cliente", descricao: "x" };
    const vazio = casoSchema.parse({ ...base, contratoOrigem: "" });
    expect("contratoOrigem" in vazio ? vazio.contratoOrigem : undefined).toBeUndefined();

    const preenchido = casoSchema.parse({ ...base, contratoOrigem: "1710.0000.0000.99" });
    expect("contratoOrigem" in preenchido && preenchido.contratoOrigem).toBe("17100000000099");
  });

  it("inadimplência aceita; fora dos 14 dígitos recusa com a mesma regra do contrato", () => {
    const base = { ...COMUNS, tipoCaso: "inadimplencia", parcelasEmAberto: "2", dataCancelamento: "2026-10-01" };
    expect(casoSchema.safeParse({ ...base, contratoOrigem: "17100000000099" }).success).toBe(true);
    const invalido = casoSchema.safeParse({ ...base, contratoOrigem: "123" });
    expect(invalido.success).toBe(false);
    expect(invalido.error?.issues[0]?.message).toBe("Contrato de origem deve ter exatamente 14 números");
  });

  it("outros tipos descartam o campo (o banco também recusa)", () => {
    const resultado = casoSchema.parse({
      ...COMUNS,
      tipoCaso: "alteracao_data",
      motivo: "pedido_cliente",
      descricao: "x",
      contratoOrigem: "17100000000099",
    });
    expect("contratoOrigem" in resultado).toBe(false);
  });
});

describe("casoSchema — subtipo do Recadastro", () => {
  const base = { ...COMUNS, tipoCaso: "recadastro_sem_reserva", descricao: "x" };

  it("é obrigatório na criação de um Recadastro", () => {
    const resultado = casoSchema.safeParse(base);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe("Selecione o subtipo do Recadastro");
  });

  it("aceita os 4 subtipos e recusa valor fora da lista", () => {
    for (const subtipo of ["troca_passageiro", "inclusao_passageiro", "troca_fornecedor", "inclusao_servicos"]) {
      expect(casoSchema.safeParse({ ...base, subtipoRecadastro: subtipo }).success).toBe(true);
    }
    expect(casoSchema.safeParse({ ...base, subtipoRecadastro: "outro" }).success).toBe(false);
  });

  it("outros tipos descartam o subtipo (o banco também recusa)", () => {
    const resultado = casoSchema.parse({
      ...COMUNS,
      tipoCaso: "alteracao_data",
      motivo: "pedido_cliente",
      descricao: "x",
      subtipoRecadastro: "troca_passageiro",
    });
    expect("subtipoRecadastro" in resultado).toBe(false);
  });
});
