"use server";

import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export type IniciarConfiguracaoMfaState = {
  qrCode?: string;
  secret?: string;
  factorId?: string;
  error?: string;
};

/**
 * QR code e segredo só vêm no retorno do enroll — se a pessoa sair da tela
 * sem terminar, não dá pra recuperar depois. Antes de gerar um novo, limpa
 * qualquer fator TOTP "unverified" de uma tentativa anterior abandonada,
 * pra não acumular lixo (fatores verificados nunca são tocados aqui).
 */
export async function iniciarConfiguracaoMfa(): Promise<IniciarConfiguracaoMfaState> {
  await requireCurrentUser({ skipMfaGate: true });
  const supabase = await createClient();

  const { data: fatores, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    console.error("Erro ao listar fatores MFA:", listError);
    return { error: "Não foi possível iniciar a configuração do 2FA. Tente novamente." };
  }

  const naoVerificados = fatores.all.filter((f) => f.factor_type === "totp" && f.status === "unverified");
  for (const fator of naoVerificados) {
    await supabase.auth.mfa.unenroll({ factorId: fator.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) {
    console.error("Erro ao iniciar enroll MFA:", error);
    return { error: "Não foi possível iniciar a configuração do 2FA. Tente novamente." };
  }

  return { qrCode: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
}

export type ConfirmarMfaState = { error?: string };

/**
 * Usada tanto por /mfa/configurar (primeiro fator, ou fator adicional a
 * partir de /seguranca) quanto por /mfa/verificar (login, fator já
 * existente) — nos dois casos é challenge+verify do mesmo factorId.
 * Redireciona ao final em vez de devolver sucesso, então quem chama não
 * precisa tratar navegação separadamente.
 */
export async function verificarCodigoMfa(
  factorId: string,
  redirectTo: string,
  _prevState: ConfirmarMfaState,
  formData: FormData
): Promise<ConfirmarMfaState> {
  await requireCurrentUser({ skipMfaGate: true });

  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length !== 6) {
    return { error: "Informe o código de 6 dígitos do app autenticador." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
  if (error) {
    return { error: "Código inválido ou expirado. Confira o app autenticador e tente de novo." };
  }

  redirect(redirectTo);
}
