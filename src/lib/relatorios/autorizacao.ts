import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export type UsuarioParaAutorizacao = { id: string; perfil: PerfilUsuario; filial: FilialCvc | null };
export type VendedorAlvo = { id: string; perfil: PerfilUsuario; filial: FilialCvc | null };

/**
 * Escopo do extrato individual por vendedor (item 4 do backlog de 22/07):
 * vendedor só o próprio; gerente só vendedor da própria filial; adm/adm
 * master sem restrição. Checagem explícita além da RLS — a RLS de usuarios
 * (usuarios_select_self/usuarios_select_filial_gerente/usuarios_select_admin)
 * já impediria o SELECT do alvo nos casos negados (a linha nem viria), mas a
 * função existe separada e pura para dar uma resposta 403 legível em vez de
 * um 404 que parece "vendedor não existe".
 *
 * A checagem "adm/adm_master sem restrição" é literal: o admin bypassa
 * mesmo o perfil ATUAL do alvo. O extrato é construído a partir de
 * casos.vendedor_dono (um fato histórico — quem era dono do caso quando ele
 * foi criado), não do perfil corrente da pessoa; alguém que era vendedor e
 * foi promovido a gerente/admin depois continua sendo o dono histórico
 * desses casos. Bug real encontrado em produção: um admin tentando baixar o
 * extrato de alguém nessa situação recebia "Sem permissão" porque o gate de
 * `alvo.perfil !== "vendedor"` rodava antes do bypass de admin. Gerente e
 * vendedor continuam exigindo que o alvo seja atualmente um vendedor — só o
 * admin, que já não tem nenhuma outra restrição, ganha a exceção.
 */
export function podeGerarExtratoVendedor(usuario: UsuarioParaAutorizacao, alvo: VendedorAlvo): boolean {
  if (usuario.perfil === "adm" || usuario.perfil === "adm_master") return true;
  if (alvo.perfil !== "vendedor") return false;
  if (usuario.perfil === "gerente") return alvo.filial !== null && alvo.filial === usuario.filial;
  if (usuario.perfil === "vendedor") return alvo.id === usuario.id;
  return false;
}
