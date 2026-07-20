import type { AcaoAuditoria } from "@/lib/supabase/types";

export const ACOES_AUDITORIA: readonly AcaoAuditoria[] = ["insert", "update", "delete", "download_signed_url"];

export function isAcaoAuditoria(v: string): v is AcaoAuditoria {
  return (ACOES_AUDITORIA as string[]).includes(v);
}
