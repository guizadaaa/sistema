import { clientAuthConferencia, respostaDaSessao, respostaMfaPendente } from "@/lib/conferencia/sessao";
import { erro, lerJson } from "@/lib/conferencia/respostas";

/**
 * POST {email, senha} -> {access_token, refresh_token, expires_at, usuario}.
 * Com TOTP ativo: {mfa_required: true, factor_id, mfa_token} e a sessão sai
 * de POST /api/conferencia/login/mfa.
 */
export async function POST(request: Request) {
  const corpo = await lerJson(request);
  const email = typeof corpo?.email === "string" ? corpo.email.trim() : "";
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";
  if (!email || !senha) return erro(400, "Informe e-mail e senha.");

  const { data, error } = await clientAuthConferencia().auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return erro(401, "E-mail ou senha incorretos.");

  return respostaMfaPendente(data.session) ?? respostaDaSessao(data.session);
}
