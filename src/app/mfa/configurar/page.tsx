import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { ConfigurarMfaForm } from "./configurar-mfa-form";

export default async function ConfigurarMfaPage() {
  await requireCurrentUser({ skipMfaGate: true });

  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // Já verificado nesta sessão — nada a configurar.
  if (aal?.currentLevel === "aal2") {
    redirect("/");
  }
  // Já tem fator verificado, só falta o código desta sessão — não o QR de novo.
  if (aal?.nextLevel === "aal2") {
    redirect("/mfa/verificar");
  }

  return <ConfigurarMfaForm />;
}
