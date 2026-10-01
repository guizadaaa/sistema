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

/** Data civil (yyyy-mm-dd) de um timestamptz no fuso da operação — evita virar o dia por causa de UTC no servidor. */
export function dataLocalSaoPaulo(instante: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante));
}

export type PrazoResolvido = {
  /** Resolvido no próprio dia do prazo conta como antes (dentro) do prazo. */
  antesDoPrazo: boolean;
  /** Sempre >= 0: distância em dias entre a resolução e o prazo, no sentido de `antesDoPrazo`. */
  dias: number;
};

/**
 * Para caso Resolvido o relógio para na resolução: compara prazo_vigencia
 * com a data em que o caso entrou em Resolvido, nunca com hoje — senão um
 * caso resolvido dentro do prazo "vence" dias depois de encerrado.
 */
export function prazoNaResolucao(prazoVigencia: string, resolvidoEm: string): PrazoResolvido {
  const prazo = Date.parse(`${prazoVigencia}T00:00:00Z`);
  const resolucao = Date.parse(`${dataLocalSaoPaulo(resolvidoEm)}T00:00:00Z`);
  const diff = Math.round((prazo - resolucao) / (1000 * 60 * 60 * 24));
  return { antesDoPrazo: diff >= 0, dias: Math.abs(diff) };
}

export function descricaoDias(dias: number): string {
  return `${dias} dia${dias === 1 ? "" : "s"}`;
}

/** Texto combinado pra badge de resolvido: "Resolvido 10 dias antes"/"Resolvido 1 dia depois"/"Resolvido no prazo". */
export function descricaoResolucao(antesDoPrazo: boolean, dias: number): string {
  if (dias === 0) return "Resolvido no prazo";
  const unidade = dias === 1 ? "dia" : "dias";
  return `Resolvido ${dias} ${unidade} ${antesDoPrazo ? "antes" : "depois"}`;
}
