// Espelha exatamente a regra de auth_has_delegacao_ativa() (RLS,
// supabase/migrations/20260716000002_rls.sql): agendada quando ainda não
// chegou o início, ativa dentro da janela, encerrada nos outros casos
// (desativada manualmente ou já passou do fim). Cálculo em TS só para
// exibição — o banco é sempre a fonte de verdade sobre quem tem a
// permissão de fato.
export type StatusDelegacao = "agendada" | "ativa" | "encerrada";

export function statusDelegacao(
  delegacao: { inicio: string; fim: string | null; ativa: boolean },
  agora: Date = new Date()
): StatusDelegacao {
  if (!delegacao.ativa) return "encerrada";

  if (agora < new Date(delegacao.inicio)) return "agendada";

  if (delegacao.fim && agora > new Date(delegacao.fim)) return "encerrada";

  return "ativa";
}

// Mesmo padrão de DIAS_VENCENDO_EM_BREVE em lib/casos/prazo.ts — 7 dias é
// razoável para o gerente se preparar; ajustar aqui se o cliente quiser outro valor.
const DIAS_AVISO_DELEGACAO_AGENDADA = 7;

export function diasAteInicio(inicioIso: string, agora: Date = new Date()): number {
  return Math.ceil((new Date(inicioIso).getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
}

/** true quando falta pouco (dentro da janela de aviso) para uma delegação agendada começar. */
export function precisaAvisoDelegacaoAgendada(
  delegacao: { inicio: string; ativa: boolean },
  agora: Date = new Date()
): boolean {
  if (!delegacao.ativa) return false;
  const dias = diasAteInicio(delegacao.inicio, agora);
  return dias >= 0 && dias <= DIAS_AVISO_DELEGACAO_AGENDADA;
}
