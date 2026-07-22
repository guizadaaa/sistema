import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export type UsuarioParaAutorizacao = { id: string; perfil: PerfilUsuario; filial: FilialCvc | null };
export type VendedorAlvo = { id: string; perfil: PerfilUsuario; filial: FilialCvc | null };

/**
 * Escopo do extrato individual por vendedor (item 4 do backlog de 22/07):
 * vendedor só o próprio; gerente só vendedor da própria filial; adm/adm
 * master sem restrição. Checagem explícita além da RLS — a RLS de usuarios
 * (usuarios_select_self/usuarios_select_filial_gerente) já impediria o
 * SELECT do alvo nos casos negados (a linha nem viria), mas a função existe
 * separada e pura para dar uma resposta 403 legível em vez de um 404 que
 * parece "vendedor não existe".
 */
export function podeGerarExtratoVendedor(usuario: UsuarioParaAutorizacao, alvo: VendedorAlvo): boolean {
  if (alvo.perfil !== "vendedor") return false;
  if (usuario.perfil === "adm" || usuario.perfil === "adm_master") return true;
  if (usuario.perfil === "gerente") return alvo.filial !== null && alvo.filial === usuario.filial;
  if (usuario.perfil === "vendedor") return alvo.id === usuario.id;
  return false;
}
