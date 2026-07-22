/**
 * Time-box e inactivity timeout aplicados fora do Supabase — o plano
 * gratuito não tem os controles nativos equivalentes (Authentication →
 * Sessions só no Pro; ver SECURITY.md). Dois cookies httpOnly, aplicados em
 * src/proxy.ts (Next.js 16 renomeou middleware.ts/middleware para
 * proxy.ts/proxy — ver AGENTS.md) a cada requisição autenticada.
 */
export const SESSAO_INICIO_COOKIE = "sessao_inicio";
export const ULTIMA_ATIVIDADE_COOKIE = "ultima_atividade";

// TEMPORÁRIO — valores reduzidos só para teste manual em PR (ver #23).
// Reverter para 12h / 30min antes do merge.
export const SESSAO_TIME_BOX_MS = 2 * 60 * 1000; // 2min (TESTE — valor final: 12h)
export const SESSAO_INATIVIDADE_MS = 1 * 60 * 1000; // 1min (TESTE — valor final: 30min)

// A checagem de expiração de verdade acontece no servidor (proxy.ts),
// comparando o timestamp guardado dentro do valor do cookie — o maxAge do
// cookie é só um teto de limpeza do lado do navegador, nunca o mecanismo de
// verdade. Por isso tem que ser bem mais folgado que SESSAO_TIME_BOX_MS: se
// fosse igual (ou pior, igual ao de inatividade), o navegador apagaria o
// cookie sozinho exatamente na hora em que o servidor precisaria vê-lo
// "presente, porém velho" para barrar — o servidor então só veria "ausente"
// e cairia no caminho de self-healing, reiniciando o relógio em silêncio em
// vez de barrar (foi exatamente esse bug: nenhuma das duas janelas nunca
// disparava, em ambiente real).
const COOKIE_MAX_AGE_MS = SESSAO_TIME_BOX_MS * 2;

export function cookieOptionsSessao() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(COOKIE_MAX_AGE_MS / 1000),
  };
}
