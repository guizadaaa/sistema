import type { StatusCaso } from "@/lib/supabase/types";

/**
 * Próximos status válidos a partir do atual (seção 5). Isto é uma regra de
 * qualidade de dados/UX, não uma fronteira de segurança — o RLS já é quem
 * garante quem pode inserir o quê; esta tabela só evita que a tela ofereça
 * saltos sem sentido (ex.: Inicial → Resolvido direto). A partir de "Em
 * andamento interno" há dois desvios opcionais, ambos levando a Resolvido:
 * Reavaliação (qualquer um que conduz o fluxo) ou Ouvidoria (só admin — ver
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
