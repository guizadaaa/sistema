// A spec (seção 10) pede destaque visual para "vencendo em breve" e
// "vencidos", sem definir a janela de "em breve" — 7 dias é um padrão
// razoável para revisão manual; ajustar aqui se o cliente quiser outro valor.
const DIAS_VENCENDO_EM_BREVE = 7;

export type SituacaoPrazo = "vencido" | "vencendo" | "normal";

/** Negativo = dias já vencido; positivo = dias até o vencimento. */
export function diasAteVencimento(prazoVigencia: string, hoje: Date = new Date()): number {
  const prazo = new Date(`${prazoVigencia}T00:00:00`);
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.floor((prazo.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24));
}

export function situacaoPrazoVigencia(prazoVigencia: string, hoje: Date = new Date()): SituacaoPrazo {
  const diffDias = diasAteVencimento(prazoVigencia, hoje);

  if (diffDias < 0) return "vencido";
  if (diffDias <= DIAS_VENCENDO_EM_BREVE) return "vencendo";
  return "normal";
}

/**
 * Escala de cor de urgência (seção de UX) — mais granular que
 * SituacaoPrazo, pensada para leitura rápida por cor em listas/tabelas.
 * "vermelho" cobre vencido e os 3 últimos dias juntos (mesma urgência
 * prática: já é tarde demais pra resolver com folga).
 */
export type CorPrazo = "verde" | "amarelo" | "laranja" | "vermelho";

/** Mesmos limites de corPrazoVigencia, mas a partir de uma contagem de dias já calculada (ex.: marco_dias de uma notificação). */
export function corPorDias(diffDias: number): CorPrazo {
  if (diffDias <= 3) return "vermelho";
  if (diffDias <= 7) return "laranja";
  if (diffDias <= 15) return "amarelo";
  return "verde";
}

export function corPrazoVigencia(prazoVigencia: string, hoje: Date = new Date()): CorPrazo {
  return corPorDias(diasAteVencimento(prazoVigencia, hoje));
}

/** Texto curto pra exibir ao lado/embaixo da data — "Vence em 12 dias", "Vence hoje", "Vencido há 3 dias". */
export function descricaoDiasAteVencimento(prazoVigencia: string, hoje: Date = new Date()): string {
  const diffDias = diasAteVencimento(prazoVigencia, hoje);

  if (diffDias === 0) return "Vence hoje";
  if (diffDias > 0) return `Vence em ${diffDias} dia${diffDias === 1 ? "" : "s"}`;
  const dias = Math.abs(diffDias);
  return `Vencido há ${dias} dia${dias === 1 ? "" : "s"}`;
}
