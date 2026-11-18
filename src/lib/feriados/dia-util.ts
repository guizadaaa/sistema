// Dia útil das lojas — regra num lugar só (calendário de importações e
// "importação atrasada" na tela de Vendas): segunda a sexta que não seja
// feriado nem ponto facultativo daquela filial. Puro (sem server-only).

export type Abrangencia = "nacional" | "estadual_PR" | "municipal";

export type Feriado = {
  data: string; // aaaa-mm-dd
  nome: string;
  abrangencia: Abrangencia;
  /** null = todas as filiais. */
  filial: string | null;
  facultativo: boolean;
};

/** Dia da semana de uma data aaaa-mm-dd (0 = domingo … 6 = sábado), sem fuso. */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function ehFimDeSemana(data: string): boolean {
  const d = diaDaSemana(data);
  return d === 0 || d === 6;
}

/** Feriado (ou ponto facultativo) daquele dia para a filial, se houver. */
export function feriadoDoDia(data: string, filial: string | null, feriados: Feriado[]): Feriado | null {
  return feriados.find((f) => f.data === data && (f.filial === null || filial === null || f.filial === filial)) ?? null;
}

/** Segunda a sexta, sem feriado nem facultativo da filial. */
export function ehDiaUtil(data: string, filial: string, feriados: Feriado[]): boolean {
  if (ehFimDeSemana(data)) return false;
  return !feriados.some((f) => f.data === data && (f.filial === null || f.filial === filial));
}

/** aaaa-mm-dd somando dias (sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Último dia útil antes de `data` (para "importação atrasada"). */
export function diaUtilAnterior(data: string, filial: string, feriados: Feriado[]): string {
  let dia = somarDias(data, -1);
  for (let i = 0; i < 30 && !ehDiaUtil(dia, filial, feriados); i++) dia = somarDias(dia, -1);
  return dia;
}
