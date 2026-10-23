import { clientAuthConferencia, respostaDaSessao } from "@/lib/conferencia/sessao";
import { erro, lerJson } from "@/lib/conferencia/respostas";

/** POST {refresh_token} -> mesmo formato do login. */
export async function POST(request: Request) {
  const corpo = await lerJson(request);
  const refreshToken = typeof corpo?.refresh_token === "string" ? corpo.refresh_token.trim() : "";
  if (!refreshToken) return erro(400, "Informe o refresh_token.");

  const { data, error } = await clientAuthConferencia().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return erro(401, "Sessão expirada. Faça login novamente.");

  return respostaDaSessao(data.session);
}
