import type { StatusCaso } from "@/lib/supabase/types";

/**
 * Próximos status válidos a partir do atual (seção 5). Isto é uma regra de
 * qualidade de dados/UX, não uma fronteira de segurança — o RLS já é quem
 * garante quem pode inserir o quê; esta tabela só evita que a tela ofereça
 * saltos sem sentido (ex.: Inicial → Resolvido direto). Ouvidoria é tratada
 * à parte (só a partir de Resolvido, só quando elegivel_ouvidoria, só
 * admin — nunca gerente delegado, ver policy status_historico_insert).
 */
const PROXIMOS_STATUS: Record<StatusCaso, StatusCaso[]> = {
  inicial: ["recepcionado"],
  recepcionado: ["em_andamento_interno"],
  em_andamento_interno: ["reavaliacao", "resolvido"],
  reavaliacao: ["resolvido"],
  resolvido: [],
  ouvidoria: ["em_andamento_interno", "resolvido"],
};

export function proximosStatusValidos(
  statusAtual: StatusCaso,
  elegivelOuvidoria: boolean,
  ehAdmin: boolean
): StatusCaso[] {
  const opcoes = [...PROXIMOS_STATUS[statusAtual]];
  if (statusAtual === "resolvido" && elegivelOuvidoria && ehAdmin) {
    opcoes.push("ouvidoria");
  }
  return opcoes;
}
