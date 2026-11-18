// Opções do select "Usuário Aura" (Vendedores do Systur). Puro: a tela monta
// e os testes verificam.

import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export type UsuarioParaVinculo = { id: string; nome: string; perfil: PerfilUsuario; filial: FilialCvc | null };

export type GruposUsuarios = {
  /** Até 3 sugestões, na ordem do ranking (sem repetir nos outros grupos). */
  sugeridos: UsuarioParaVinculo[];
  /** usuarios.filial = loja da linha. */
  daLoja: UsuarioParaVinculo[];
  /** Outras lojas (recolhido na tela; vendedor transferido continua vinculável). */
  outrasLojas: UsuarioParaVinculo[];
  /** adm/adm_master (sem loja), no fim. */
  administracao: UsuarioParaVinculo[];
};

const comparar = (a: UsuarioParaVinculo, b: UsuarioParaVinculo) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

export function agruparUsuariosParaVinculo(usuarios: UsuarioParaVinculo[], loja: FilialCvc, sugeridosIds: string[] = []): GruposUsuarios {
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const sugeridos = sugeridosIds.map((id) => porId.get(id)).filter((u): u is UsuarioParaVinculo => !!u).slice(0, 3);
  const jaSugeridos = new Set(sugeridos.map((u) => u.id));
  const resto = usuarios.filter((u) => !jaSugeridos.has(u.id));
  const ehAdmin = (u: UsuarioParaVinculo) => u.perfil === "adm" || u.perfil === "adm_master";
  return {
    sugeridos,
    daLoja: resto.filter((u) => !ehAdmin(u) && u.filial === loja).sort(comparar),
    outrasLojas: resto.filter((u) => !ehAdmin(u) && u.filial !== loja).sort(comparar),
    administracao: resto.filter(ehAdmin).sort(comparar),
  };
}
