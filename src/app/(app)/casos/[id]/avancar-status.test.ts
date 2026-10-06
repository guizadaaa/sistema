import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { avancarStatus } = await import("./actions");

function bancoRespondendo(erro: { message: string } | null) {
  createClientMock.mockResolvedValue({
    from: () => ({ insert: () => Promise.resolve({ error: erro }) }),
  });
}

beforeEach(() => createClientMock.mockReset());

describe("avancarStatus — mensagens do banco", () => {
  it.each([
    "Transição de status inválida: de Inicial não é possível ir para Resolvido.",
    "O caso já está em Recepcionado.",
    "Caso Resolvido não pode mudar de status. Somente o adm pode reabri-lo, para Em andamento interno ou Reavaliação.",
    "Somente o adm pode mover um caso para Ouvidoria.",
    "Não é possível marcar como Resolvido sem pelo menos um comentário registrado no caso.",
  ])("repassa a mensagem da trigger: %s", async (mensagem) => {
    bancoRespondendo({ message: mensagem });
    expect(await avancarStatus("c1", "resolvido")).toEqual({ error: mensagem });
  });

  it("erro de RLS (ou qualquer outro) vira mensagem genérica, sem detalhe técnico", async () => {
    bancoRespondendo({ message: 'new row violates row-level security policy for table "status_historico"' });
    expect(await avancarStatus("c1", "recepcionado")).toEqual({
      error: "Não foi possível avançar o status. Verifique se você tem permissão para esta ação.",
    });
  });

  it("sucesso devolve sem erro", async () => {
    bancoRespondendo(null);
    expect(await avancarStatus("c1", "recepcionado")).toEqual({});
  });
});
