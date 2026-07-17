// A spec (seção 10) pede destaque visual para "vencendo em breve" e
// "vencidos", sem definir a janela de "em breve" — 7 dias é um padrão
// razoável para revisão manual; ajustar aqui se o cliente quiser outro valor.
const DIAS_VENCENDO_EM_BREVE = 7;

export type SituacaoPrazo = "vencido" | "vencendo" | "normal";

export function situacaoPrazoVigencia(prazoVigencia: string, hoje: Date = new Date()): SituacaoPrazo {
  const prazo = new Date(`${prazoVigencia}T00:00:00`);
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffDias = Math.floor((prazo.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return "vencido";
  if (diffDias <= DIAS_VENCENDO_EM_BREVE) return "vencendo";
  return "normal";
}
