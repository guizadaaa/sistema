import { describe, expect, it, vi } from "vitest";

const requireCurrentUserMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: requireCurrentUserMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/notificacoes/listar", () => ({
  buscarNotificacoesRecentes: vi.fn(),
  contarNotificacoesNaoLidas: vi.fn(),
}));

const { marcarNotificacaoComoLida, marcarTodasNotificacoesComoLidas } = await import("./actions");

describe("marcarNotificacaoComoLida", () => {
  it("atualiza só a notificação pelo id informado", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "u1", perfil: "vendedor" });

    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockResolvedValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const resultado = await marcarNotificacaoComoLida("notif-1");

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ lida_em: expect.any(String) }));
    expect(eqMock).toHaveBeenCalledWith("id", "notif-1");
    expect(resultado.error).toBeUndefined();
  });
});

describe("marcarTodasNotificacoesComoLidas", () => {
  it("atualiza só as ainda não lidas (is lida_em null)", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "u1", perfil: "vendedor" });

    const isMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ is: isMock });
    createClientMock.mockResolvedValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const resultado = await marcarTodasNotificacoesComoLidas();

    expect(isMock).toHaveBeenCalledWith("lida_em", null);
    expect(resultado.error).toBeUndefined();
  });
});
