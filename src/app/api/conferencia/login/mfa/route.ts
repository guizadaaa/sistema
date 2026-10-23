import { aalDoToken } from "@/lib/conferencia/mfa";
import { erro, lerJson } from "@/lib/conferencia/respostas";
import { clientAuthConferencia, respostaDaSessao } from "@/lib/conferencia/sessao";

/**
 * POST {mfa_token, factor_id, code} -> sessão aal2 (mesmo formato do login).
 * mfa_token = refresh_token da sessão aal1 devolvida por /login; com ela,
 * challenge + verify do fator TOTP.
 */
export async function POST(request: Request) {
  const corpo = await lerJson(request);
  const mfaToken = typeof corpo?.mfa_token === "string" ? corpo.mfa_token.trim() : "";
  const factorId = typeof corpo?.factor_id === "string" ? corpo.factor_id.trim() : "";
  const code = typeof corpo?.code === "string" || typeof corpo?.code === "number" ? String(corpo.code).trim() : "";
  if (!mfaToken || !factorId || !/^\d{6}$/.test(code)) return erro(400, "Informe mfa_token, factor_id e o código de 6 dígitos.");

  const auth = clientAuthConferencia().auth;
  const { data: sessao, error: erroSessao } = await auth.refreshSession({ refresh_token: mfaToken });
  if (erroSessao || !sessao.session) return erro(401, "Login expirado. Entre com e-mail e senha de novo.");

  const { data: desafio, error: erroDesafio } = await auth.mfa.challenge({ factorId });
  if (erroDesafio || !desafio) return erro(400, "Fator de autenticação inválido.");

  const { data, error } = await auth.mfa.verify({ factorId, challengeId: desafio.id, code });
  if (error || !data || aalDoToken(data.access_token) !== "aal2") return erro(401, "Código inválido.");

  return respostaDaSessao({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    token_type: "bearer",
    user: data.user,
  });
}
