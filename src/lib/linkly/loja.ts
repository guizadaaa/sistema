import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

/** ?loja= da URL — inválido ou ausente = todas as lojas (undefined). */
export function resolverLoja(valor: string | string[] | undefined): FilialCvc | undefined {
  return typeof valor === "string" && (FILIAIS as readonly string[]).includes(valor) ? (valor as FilialCvc) : undefined;
}

/** Filtro de loja aplicado no app (as funções do banco já restringem por perfil). */
export function filtrarPorLoja<T extends { filial: FilialCvc }>(linhas: T[], loja?: FilialCvc): T[] {
  return loja ? linhas.filter((l) => l.filial === loja) : linhas;
}
