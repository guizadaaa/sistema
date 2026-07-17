// O Postgres serializa a coluna `duracao` (interval) como texto no formato
// "N day(s) HH:MM:SS[.ffffff]" (dias omitido quando < 1 dia) — confirmado
// rodando contra Postgres real, não é um formato inventado. A spec (seção
// 5) só pede granularidade de dias na exibição ("3 dias no Inicial"), então
// convertemos para dias inteiros (piso) em vez de mostrar horas/minutos.
export function formatarDuracaoEmDias(duracaoPostgres: string): string {
  const match = duracaoPostgres.match(/^(?:(\d+) days? )?(\d{1,3}):(\d{2}):(\d{2})/);
  if (!match) return duracaoPostgres;

  const dias = Number(match[1] ?? 0);

  if (dias === 0) return "Menos de 1 dia";
  if (dias === 1) return "1 dia";
  return `${dias} dias`;
}

/** Mesmo formato de duracaoPostgres acima, mas como número (dias fracionários) para ordenação. */
export function duracaoEmDiasFracionarios(duracaoPostgres: string): number {
  const match = duracaoPostgres.match(/^(?:(\d+) days? )?(\d{1,3}):(\d{2}):(\d{2})/);
  if (!match) return 0;

  const [, diasStr, horasStr, minutosStr, segundosStr] = match;
  return (
    Number(diasStr ?? 0) +
    Number(horasStr) / 24 +
    Number(minutosStr) / (24 * 60) +
    Number(segundosStr) / (24 * 60 * 60)
  );
}
