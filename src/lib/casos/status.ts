import type { StatusCaso } from "@/lib/supabase/types";

// Fonte única da ordem/lista de status — usada por Acompanhar Casos (filtro),
// Dashboard e Painel de Gestão (métricas por status). Uma mudança de status
// (ex.: a introdução de "ouvidoria" na timeline) só precisa ser feita aqui.
export const STATUS_ORDEM: readonly StatusCaso[] = [
  "inicial",
  "recepcionado",
  "em_andamento_interno",
  "reavaliacao",
  "ouvidoria",
  "resolvido",
];

/**
 * Próximos status válidos a partir do atual (seção 5). Espelha a trigger
 * validar_transicao_status (20261006000003), que é quem impõe a ordem no
 * banco — esta tabela só decide o que a tela oferece. A reabertura de
 * Resolvido (só admin, no banco) não aparece aqui de propósito: não há
 * botão para isso. A partir de "Em
 * andamento interno" há dois desvios opcionais, ambos levando a Resolvido:
 * Reavaliação (qualquer um que avança status: admin, gerente delegado ou
 * vendedor dono — ver auth_pode_avancar_status) ou Ouvidoria (só admin — ver
 * policy status_historico_insert).
 */
const PROXIMOS_STATUS: Record<StatusCaso, StatusCaso[]> = {
  inicial: ["recepcionado"],
  recepcionado: ["em_andamento_interno"],
  em_andamento_interno: ["reavaliacao", "ouvidoria", "resolvido"],
  reavaliacao: ["resolvido"],
  ouvidoria: ["resolvido"],
  resolvido: [],
};

export function proximosStatusValidos(statusAtual: StatusCaso, ehAdmin: boolean): StatusCaso[] {
  const opcoes = PROXIMOS_STATUS[statusAtual];
  return ehAdmin ? opcoes : opcoes.filter((s) => s !== "ouvidoria");
}
