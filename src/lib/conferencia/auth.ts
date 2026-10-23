import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

import { faltaSegundoFator } from "./mfa";
import { erro } from "./respostas";

// Rotas /api/conferencia/*: chamadas pelo service worker da extensão "Aura
// Conferência", sem cookie de sessão — o usuário vem do header
// Authorization: Bearer <access_token do Supabase>. O proxy (src/proxy.ts)
// não roda nestas rotas.

export type UsuarioConferencia = {
  id: string;
  nome: string;
  papel: PerfilUsuario;
  lojas: FilialCvc[];
};

type LinhaUsuario = { id: string; nome_completo: string; perfil: PerfilUsuario; filial: FilialCvc | null; ativo: boolean };

/** Admin atua nas três lojas; vendedor/gerente só na usuarios.filial. */
export function lojasDoUsuario(perfil: PerfilUsuario, filial: FilialCvc | null): FilialCvc[] {
  if (perfil === "adm" || perfil === "adm_master") return [...FILIAIS];
  return filial ? [filial] : [];
}

export function tokenDoHeader(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [tipo, token] = header.split(" ");
  return tipo?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

/** Usuário ativo da Aura dono do id (null se não existir ou estiver inativo). */
export async function carregarUsuarioConferencia(id: string): Promise<UsuarioConferencia | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome_completo, perfil, filial, ativo")
    .eq("id", id)
    .maybeSingle<LinhaUsuario>();
  if (error) throw error;
  if (!data || !data.ativo) return null;
  return { id: data.id, nome: data.nome_completo, papel: data.perfil, lojas: lojasDoUsuario(data.perfil, data.filial) };
}

/**
 * Valida o Bearer token com supabase.auth.getUser(token). Devolve o usuário
 * ou a Response de erro (401 token ausente/inválido ou sem o 2FA concluído
 * para quem tem TOTP ativo, 403 usuário inativo).
 */
export async function autenticar(request: Request): Promise<UsuarioConferencia | Response> {
  const token = tokenDoHeader(request);
  if (!token) return erro(401, "Token ausente.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return erro(401, "Token inválido ou expirado.");
  if (faltaSegundoFator(data.user, token)) return erro(401, "Conclua a verificação em duas etapas.");

  const usuario = await carregarUsuarioConferencia(data.user.id);
  if (!usuario) return erro(403, "Usuário sem acesso à Aura (inativo ou sem perfil).");
  return usuario;
}
