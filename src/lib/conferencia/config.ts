import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ConfigConferencia = { versao_atual: string | null; logins_gravacao: string[] };

export async function carregarConfig(): Promise<ConfigConferencia> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("conferencia_config").select("versao_atual, logins_gravacao").maybeSingle();
  if (error) throw error;
  return { versao_atual: data?.versao_atual ?? null, logins_gravacao: data?.logins_gravacao ?? [] };
}

/** Login do Systur autorizado a gravar (comparação sem caixa/espaços). */
export function loginPodeGravar(login: unknown, config: ConfigConferencia): boolean {
  if (typeof login !== "string" || !login.trim()) return false;
  const alvo = login.trim().toUpperCase();
  return config.logins_gravacao.some((l) => l.trim().toUpperCase() === alvo);
}
