import { requireCurrentUser } from "@/lib/auth/current-user";
import { mfaObrigatorioPara } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

import { SegurancaMfa } from "./seguranca-mfa";

export default async function SegurancaPage() {
  const usuario = await requireCurrentUser();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Segurança</h1>
      <SegurancaMfa fatores={data?.totp ?? []} obrigatorio={mfaObrigatorioPara(usuario.perfil)} />
    </div>
  );
}
