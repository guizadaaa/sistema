import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { caminhoRedirectSeguro } from "@/lib/validation/redirect-path";

// Tipos que este fluxo realmente emite (convite e recuperação de senha —
// seção 3 do template de e-mail; não usamos signup/magiclink/email_change).
const TIPOS_SUPORTADOS: readonly string[] = ["invite", "recovery"];

/**
 * Aponta pra cá o link enviado por e-mail (convite via Admin API,
 * "esqueci minha senha" via resetPasswordForEmail) — configurado nos
 * templates de e-mail do Supabase como
 * "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password"
 * (ver instruções no painel do Supabase). verifyOtp troca o token por uma
 * sessão válida (grava o cookie via createClient) antes do redirect —
 * diferente do fluxo PKCE padrão, não depende de um code_verifier gerado no
 * mesmo browser, o que é essencial aqui: quem recebe o convite quase sempre
 * abre o link num browser/dispositivo diferente de quem o gerou.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = caminhoRedirectSeguro.parse(searchParams.get("next") ?? undefined) ?? "/";

  if (tokenHash && type && TIPOS_SUPORTADOS.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?erro=link_invalido");
}
