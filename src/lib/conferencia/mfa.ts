import type { User } from "@supabase/supabase-js";

// 2FA na API da extensão: quem tem fator TOTP verificado no Supabase só
// recebe sessão final (e só usa as rotas protegidas) com aal2.

/** Fator TOTP verificado do usuário, se houver. */
export function fatorTotpVerificado(user: Pick<User, "factors">): string | null {
  return user.factors?.find((f) => f.factor_type === "totp" && f.status === "verified")?.id ?? null;
}

/** Claim "aal" do access_token (já validado pelo Supabase — aqui só lê). */
export function aalDoToken(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1] ?? "";
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { aal?: unknown };
    return typeof json.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

/** true quando o usuário tem 2FA ativo e o token ainda não passou pelo código (aal1). */
export function faltaSegundoFator(user: Pick<User, "factors">, accessToken: string): boolean {
  return fatorTotpVerificado(user) !== null && aalDoToken(accessToken) !== "aal2";
}
