import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

type Pessoa = { id: string; perfil: PerfilUsuario; filial: FilialCvc | null };

/**
 * Espelha transferir_usuario_loja() (20261027000001) só para mostrar ou não
 * o botão — quem decide é a função no banco.
 * gerente: só vendedor da própria loja; adm/adm_master: qualquer vendedor/gerente.
 */
export function podeTransferirLoja(quem: Pessoa, alvo: Pessoa): boolean {
  if (alvo.perfil !== "vendedor" && alvo.perfil !== "gerente") return false;
  if (!alvo.filial) return false;
  if (quem.perfil === "adm" || quem.perfil === "adm_master") return true;
  return quem.perfil === "gerente" && alvo.perfil === "vendedor" && alvo.filial === quem.filial;
}
