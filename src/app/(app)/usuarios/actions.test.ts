import { describe, expect, it, vi } from "vitest";

// C3 (auditoria de segurança): atualizarUsuario troca o e-mail de login via
// createAdminClient() (service role, bypassa RLS) ANTES do UPDATE em
// public.usuarios que a RLS usuarios_update_adm_master protege de verdade.
// Sem a guarda de perfil, um gerente que enxerga o e-mail de um vendedor da
// própria filial (usuarios_select_filial_gerente) conseguia trocar o e-mail
// de login dele mesmo sendo rejeitado depois pelo UPDATE — este teste prova
// que a chamada à Admin API nunca acontece para quem não é adm_master.

const requireCurrentUserMock = vi.fn();
const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: requireCurrentUserMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map()),
}));

const { atualizarUsuario } = await import("./actions");

const dadosValidos = {
  nomeCompleto: "Fulano de Tal",
  email: "novo@example.com",
  perfil: "vendedor" as const,
  filial: "1710" as const,
  ativo: true,
};

describe("atualizarUsuario", () => {
  it("bloqueia quem não é adm_master antes de qualquer chamada à Admin API", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "gerente-1", perfil: "gerente" });

    const resultado = await atualizarUsuario("outro-usuario-id", dadosValidos);

    expect(resultado.error).toBe("Apenas o adm_master pode atualizar usuários.");
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("segue até a Admin API normalmente quando quem chama é adm_master", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "admmaster-1", perfil: "adm_master" });

    const singleMock = vi.fn().mockResolvedValue({ data: { email: "antigo@example.com" }, error: null });
    const eqSelectMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });

    const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock });

    let chamadasEmFrom = 0;
    const fromMock = vi.fn(() => {
      chamadasEmFrom += 1;
      return chamadasEmFrom === 1 ? { select: selectMock } : { update: updateMock };
    });

    createClientMock.mockResolvedValue({ from: fromMock });

    const updateUserByIdMock = vi.fn().mockResolvedValue({ error: null });
    createAdminClientMock.mockReturnValue({ auth: { admin: { updateUserById: updateUserByIdMock } } });

    const resultado = await atualizarUsuario("alvo-id", dadosValidos);

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);
    expect(updateUserByIdMock).toHaveBeenCalledWith("alvo-id", { email: dadosValidos.email });
    expect(resultado.error).toBeUndefined();
  });
});
