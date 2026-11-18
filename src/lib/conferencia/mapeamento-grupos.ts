// Filtro "Mostrar" da tela Cliques → Vendedores Systur (puro: tela e testes).
// O grupo de cada nome vem do banco (systur_mapeamento_grupos):
//   atual        vinculado a usuário ativo;
//   sem_vinculo  sem vínculo ou vinculado a usuário inativo (ex-vendedor);
//   site         vendas pela internet.

export type GrupoMapeamento = "atual" | "sem_vinculo" | "site";
export type MostrarMapeamento = "atual" | "sem_vinculo" | "parecem" | "site" | "todos";

export const OPCOES_MOSTRAR: { valor: MostrarMapeamento; rotulo: string }[] = [
  { valor: "atual", rotulo: "Equipe atual" },
  { valor: "sem_vinculo", rotulo: "Sem vínculo" },
  { valor: "parecem", rotulo: "Parecem usuários ativos" },
  { valor: "site", rotulo: "Site / Internet" },
  { valor: "todos", rotulo: "Todos" },
];

type ComGrupo = { grupo: GrupoMapeamento; pareceAtivo: boolean };

export function casaMostrar(linha: ComGrupo, mostrar: MostrarMapeamento): boolean {
  if (mostrar === "todos") return true;
  if (mostrar === "parecem") return linha.pareceAtivo;
  return linha.grupo === mostrar;
}

export function contarPorMostrar(linhas: ComGrupo[]): Record<MostrarMapeamento, number> {
  const total = {} as Record<MostrarMapeamento, number>;
  for (const { valor } of OPCOES_MOSTRAR) total[valor] = linhas.filter((l) => casaMostrar(l, valor)).length;
  return total;
}

/** ?mostrar=… (padrão: equipe atual); aceita os links antigos ?parecem=1 e ?sem_vinculo=1. */
export function lerMostrar(sp: Record<string, string | string[] | undefined>): MostrarMapeamento {
  const v = typeof sp.mostrar === "string" ? sp.mostrar : "";
  if (OPCOES_MOSTRAR.some((o) => o.valor === v)) return v as MostrarMapeamento;
  if (sp.parecem === "1") return "parecem";
  if (sp.sem_vinculo === "1") return "sem_vinculo";
  return "atual";
}
