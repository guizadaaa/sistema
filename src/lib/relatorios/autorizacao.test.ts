import { describe, expect, it } from "vitest";

import { podeGerarExtratoVendedor } from "./autorizacao";

const vendedorA = { id: "v-a", perfil: "vendedor" as const, filial: "1710" as const };
const vendedorB = { id: "v-b", perfil: "vendedor" as const, filial: "1710" as const };
const vendedorOutraFilial = { id: "v-c", perfil: "vendedor" as const, filial: "1714" as const };
const gerenteComoAlvo = { id: "g-1", perfil: "gerente" as const, filial: "1710" as const };

describe("podeGerarExtratoVendedor", () => {
  it("vendedor pode gerar o próprio extrato", () => {
    expect(podeGerarExtratoVendedor({ id: "v-a", perfil: "vendedor", filial: "1710" }, vendedorA)).toBe(true);
  });

  it("vendedor NÃO pode gerar extrato de outro vendedor, mesmo da mesma filial", () => {
    expect(podeGerarExtratoVendedor({ id: "v-a", perfil: "vendedor", filial: "1710" }, vendedorB)).toBe(false);
  });

  it("gerente pode gerar extrato de vendedor da própria filial", () => {
    expect(podeGerarExtratoVendedor({ id: "g-1", perfil: "gerente", filial: "1710" }, vendedorA)).toBe(true);
  });

  it("gerente NÃO pode gerar extrato de vendedor de outra filial", () => {
    expect(podeGerarExtratoVendedor({ id: "g-1", perfil: "gerente", filial: "1710" }, vendedorOutraFilial)).toBe(false);
  });

  it("adm e adm_master podem gerar extrato de qualquer vendedor", () => {
    expect(podeGerarExtratoVendedor({ id: "a-1", perfil: "adm", filial: null }, vendedorOutraFilial)).toBe(true);
    expect(podeGerarExtratoVendedor({ id: "am-1", perfil: "adm_master", filial: null }, vendedorOutraFilial)).toBe(true);
  });

  it("nunca gera extrato para um alvo que não é vendedor (gerente/admin como alvo)", () => {
    expect(podeGerarExtratoVendedor({ id: "am-1", perfil: "adm_master", filial: null }, gerenteComoAlvo)).toBe(false);
  });
});
