import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { VerificarMfaForm } from "./verificar-mfa-form";

export default async function VerificarMfaPage() {
  await requireCurrentUser({ skipMfaGate: true });

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === "aal2") {
    redirect("/");
  }
  if (aal?.nextLevel !== "aal2") {
    // Sem fator verificado — não há o que "verificar" aqui, precisa configurar.
    redirect("/mfa/configurar");
  }

  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const factorId = fatores?.totp[0]?.id;

  if (!factorId) {
    // Não deveria acontecer (nextLevel já garantiu um fator verificado) —
    // se acontecer mesmo assim, cai pra configuração em vez de travar aqui.
    redirect("/mfa/configurar");
  }

  return <VerificarMfaForm factorId={factorId} />;
}
