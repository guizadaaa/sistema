import { clientAuthConferencia, respostaDaSessao } from "@/lib/conferencia/sessao";
import { faltaSegundoFator } from "@/lib/conferencia/mfa";
import { erro, lerJson } from "@/lib/conferencia/respostas";

/**
 * POST {refresh_token} -> mesmo formato do login. O Supabase mantém o aal da
 * sessão no refresh; um refresh aal1 de quem tem 2FA (ex.: o mfa_token) não
 * vira sessão — precisa passar por /login/mfa.
 */
export async function POST(request: Request) {
  const corpo = await lerJson(request);
  const refreshToken = typeof corpo?.refresh_token === "string" ? corpo.refresh_token.trim() : "";
  if (!refreshToken) return erro(400, "Informe o refresh_token.");

  const { data, error } = await clientAuthConferencia().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return erro(401, "Sessão expirada. Faça login novamente.");
  if (faltaSegundoFator(data.session.user, data.session.access_token)) {
    return erro(401, "Conclua a verificação em duas etapas.");
  }

  return respostaDaSessao(data.session);
}
