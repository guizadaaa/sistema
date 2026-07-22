import type { PerfilUsuario } from "@/lib/supabase/types";

/**
 * Perfis com acesso a dado sensível sem máscara (gestão de usuários, dados
 * bancários de desfechos via desfechos_visivel, auditoria) — 2FA obrigatório.
 * Vendedor e gerente continuam podendo ativar por conta própria em
 * /seguranca; só não são forçados. Delegação ativa não amplia essa
 * exposição (desfechos_visivel só libera dado bancário sem máscara para
 * vendedor_dono ou admin, nunca para auth_has_delegacao_ativa()), então não
 * há motivo pra incluir gerente aqui mesmo durante uma delegação.
 */
const PERFIS_COM_MFA_OBRIGATORIO: readonly PerfilUsuario[] = ["adm", "adm_master"];

export function mfaObrigatorioPara(perfil: PerfilUsuario): boolean {
  return PERFIS_COM_MFA_OBRIGATORIO.includes(perfil);
}
