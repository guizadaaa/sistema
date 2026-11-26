// Tabela "Casos por status" da página inicial (status × filial ou vendedor).
// Pura: a página monta, os testes verificam. Os números vêm de uma consulta
// agregada só (dashboard_casos_contagem: filial × dono × status); totais por
// filial, por vendedor e geral saem dela, então sempre batem entre si.

import { urlCasos } from "@/lib/casos/barra-status";
import type { CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";
import { STATUS_ORDEM } from "@/lib/casos/status";
import type { FilialCvc, StatusCaso } from "@/lib/supabase/types";

export const LOJAS_INICIO: readonly FilialCvc[] = ["1710", "1714", "1730"];
/** Os 5 status em aberto, na ordem da lista (Resolvido vai à parte). */
export const STATUS_ABERTOS = STATUS_ORDEM.filter((s) => s !== "resolvido");

export type ContagemCasos = { filial: FilialCvc; dono: string; status: StatusCaso; total: number; vencidos: number; vencem5: number };

export type Numeros = { porStatus: Record<StatusCaso, number>; emAberto: number; vencidos: number; vencem5: number };

export type LinhaTabela = {
  chave: string;
  rotulo: string;
  /** Ex.: "5 vendedores" (por filial). */
  subtitulo?: string;
  etiqueta?: "outra loja" | "inativo";
  /** Filtros do link de cada número desta linha. */
  filial?: FilialCvc;
  vendedor?: string;
  numeros: Numeros;
};

export type GrupoTabela = { titulo?: string; linhas: LinhaTabela[] };

const zero = (): Numeros => ({
  porStatus: Object.fromEntries(STATUS_ORDEM.map((s) => [s, 0])) as Record<StatusCaso, number>,
  emAberto: 0,
  vencidos: 0,
  vencem5: 0,
});

export function somar(contagens: ContagemCasos[]): Numeros {
  const n = zero();
  for (const c of contagens) {
    n.porStatus[c.status] += c.total;
    if (c.status !== "resolvido") n.emAberto += c.total;
    n.vencidos += c.vencidos;
    n.vencem5 += c.vencem5;
  }
  return n;
}

const porNome = (a: { rotulo: string }, b: { rotulo: string }) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" });

/** Uma linha por filial (as visíveis), com "N vendedores" (equipe ativa da loja). */
export function linhasPorFilial(
  contagens: ContagemCasos[],
  candidatos: CandidatoVendedor[],
  lojas: readonly FilialCvc[],
  rotuloLoja: (l: FilialCvc) => string
): LinhaTabela[] {
  return lojas.map((loja) => {
    const equipe = candidatos.filter((c) => c.ativo && c.filial === loja).length;
    return {
      chave: loja,
      rotulo: rotuloLoja(loja),
      subtitulo: `${equipe} ${equipe === 1 ? "vendedor" : "vendedores"}`,
      filial: loja,
      numeros: somar(contagens.filter((c) => c.filial === loja)),
    };
  });
}

/**
 * Vendedores agrupados pela loja do CASO, em ordem alfabética: entra todo
 * dono de caso (aberto ou resolvido); quem hoje é de outra loja ou está
 * inativo ganha a etiqueta.
 */
export function gruposPorVendedor(
  contagens: ContagemCasos[],
  candidatos: CandidatoVendedor[],
  lojas: readonly FilialCvc[],
  rotuloLoja: (l: FilialCvc) => string,
  nomeDe: (id: string) => string | undefined = () => undefined
): GrupoTabela[] {
  const pessoa = new Map(candidatos.map((c) => [c.id, c]));
  return lojas
    .map((loja) => {
      const donos = [...new Set(contagens.filter((c) => c.filial === loja).map((c) => c.dono))];
      const linhas = donos
        .map((dono): LinhaTabela => {
          const p = pessoa.get(dono);
          return {
            chave: `${loja}:${dono}`,
            rotulo: p?.nome ?? nomeDe(dono) ?? "—",
            etiqueta: p && !p.ativo ? "inativo" : p && p.filial !== loja ? "outra loja" : undefined,
            filial: loja,
            vendedor: dono,
            numeros: somar(contagens.filter((c) => c.filial === loja && c.dono === dono)),
          };
        })
        .sort(porNome);
      return { titulo: rotuloLoja(loja), linhas };
    })
    .filter((g) => g.linhas.length > 0);
}

/** Link do número: status (ou "aberto" = só não resolvidos) + filial/vendedor da linha. */
export function hrefNumero(linha: Pick<LinhaTabela, "filial" | "vendedor">, coluna: StatusCaso | "aberto"): string {
  return urlCasos(
    { filial: linha.filial, vendedor: linha.vendedor },
    coluna === "aberto" ? { aberto: true } : { status: coluna }
  );
}

const ROTULO_COLUNA: Record<StatusCaso | "aberto", [string, string]> = {
  inicial: ["Inicial", "Inicial"],
  recepcionado: ["Recepcionado", "Recepcionado"],
  em_andamento_interno: ["Em andamento interno", "Em andamento interno"],
  reavaliacao: ["Reavaliação", "Reavaliação"],
  ouvidoria: ["Ouvidoria", "Ouvidoria"],
  resolvido: ["Resolvido", "Resolvido"],
  aberto: ["Em aberto", "Em aberto"],
};

/** "Inicial: 1 caso na filial 1714" / "Em aberto: 3 casos de Jean (1730)" / "Resolvido: 10 casos no total". */
export function ariaNumero(linha: Pick<LinhaTabela, "filial" | "vendedor" | "rotulo">, coluna: StatusCaso | "aberto", n: number): string {
  const casos = `${n} ${n === 1 ? "caso" : "casos"}`;
  const onde = linha.vendedor ? `de ${linha.rotulo}${linha.filial ? ` (${linha.filial})` : ""}` : linha.filial ? `na filial ${linha.filial}` : "no total";
  return `${ROTULO_COLUNA[coluna][0]}: ${casos} ${onde}`;
}

/** Dias inteiros na etapa ("Menos de 1 dia", "1 dia", "12 dias"). */
export function tempoNaEtapa(entrouEm: string, agora: Date = new Date()): string {
  const dias = Math.floor((agora.getTime() - new Date(entrouEm).getTime()) / 86_400_000);
  if (dias < 1) return "Menos de 1 dia";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}
