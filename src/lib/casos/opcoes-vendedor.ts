// Opções do filtro Vendedor de Acompanhar Casos, conforme a Filial escolhida.
// Puro: o servidor usa para validar a URL e o navegador para trocar a lista
// na hora em que a Filial muda (sem varrer casos — os candidatos vêm de
// vendedores_filtro_casos_lojas).

import type { FilialCvc } from "@/lib/supabase/types";

export const LOJAS_VENDEDOR: readonly FilialCvc[] = ["1710", "1714", "1730"];

export type CandidatoVendedor = {
  id: string;
  nome: string;
  /** Loja atual (usuarios.filial). */
  filial: FilialCvc | null;
  ativo: boolean;
  /** Filiais dos casos em que é dono. */
  filiaisCasos: FilialCvc[];
};

export type OpcaoVendedorFiltro = { id: string; nome: string; etiqueta?: "outra loja" | "inativo" };

export type GruposVendedor = {
  /** Filial = Todas: um grupo por loja; Filial = X: só o grupo da X. */
  grupos: { loja: FilialCvc; opcoes: OpcaoVendedorFiltro[] }[];
  /** Donos de casos da filial que hoje são de outra loja ou estão inativos (só com Filial escolhida). */
  outros: OpcaoVendedorFiltro[];
};

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

export function gruposVendedor(candidatos: CandidatoVendedor[], filial?: FilialCvc): GruposVendedor {
  const daLoja = (loja: FilialCvc) =>
    candidatos.filter((c) => c.ativo && c.filial === loja).map((c) => ({ id: c.id, nome: c.nome })).sort(porNome);

  if (!filial) {
    return { grupos: LOJAS_VENDEDOR.map((loja) => ({ loja, opcoes: daLoja(loja) })).filter((g) => g.opcoes.length > 0), outros: [] };
  }
  const outros = candidatos
    .filter((c) => c.filiaisCasos.includes(filial) && !(c.ativo && c.filial === filial))
    .map((c): OpcaoVendedorFiltro => ({ id: c.id, nome: c.nome, etiqueta: c.ativo ? "outra loja" : "inativo" }))
    .sort(porNome);
  return { grupos: [{ loja: filial, opcoes: daLoja(filial) }], outros };
}

/** O vendedor existe nas opções da filial? (URL antiga incompatível → ignora; troca de Filial → "Todos".) */
export function vendedorNaFilial(candidatos: CandidatoVendedor[], filial: FilialCvc | undefined, id: string | undefined): boolean {
  if (!id) return false;
  const { grupos, outros } = gruposVendedor(candidatos, filial);
  return grupos.some((g) => g.opcoes.some((o) => o.id === id)) || outros.some((o) => o.id === id);
}
