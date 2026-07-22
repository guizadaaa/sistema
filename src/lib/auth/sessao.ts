/**
 * Time-box e inactivity timeout aplicados fora do Supabase — o plano
 * gratuito não tem os controles nativos equivalentes (Authentication →
 * Sessions só no Pro; ver SECURITY.md). Dois cookies httpOnly, aplicados em
 * src/proxy.ts (Next.js 16 renomeou middleware.ts/middleware para
 * proxy.ts/proxy — ver AGENTS.md) a cada requisição autenticada.
 */
export const SESSAO_INICIO_COOKIE = "sessao_inicio";
export const ULTIMA_ATIVIDADE_COOKIE = "ultima_atividade";

export const SESSAO_TIME_BOX_MS = 12 * 60 * 60 * 1000; // 12h
export const SESSAO_INATIVIDADE_MS = 30 * 60 * 1000; // 30min

export function cookieOptionsSessao(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
