export type Pagina<T> = {
  itens: T[];
  pagina: number;
  totalPaginas: number;
};

/**
 * Página fora do intervalo (ou lixo vindo da URL) cai na página válida mais
 * próxima em vez de mostrar uma lista vazia — o link continua útil mesmo
 * depois que a lista encolhe (ex. um caso foi resolvido).
 */
export function paginar<T>(lista: T[], paginaSolicitada: unknown, porPagina: number): Pagina<T> {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const numero = Math.trunc(Number(paginaSolicitada));
  const pagina = Number.isFinite(numero) ? Math.min(Math.max(numero, 1), totalPaginas) : 1;
  const inicio = (pagina - 1) * porPagina;
  return { itens: lista.slice(inicio, inicio + porPagina), pagina, totalPaginas };
}
