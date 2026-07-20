import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarAuditoria } from "@/lib/auditoria/listar";
import { isAcaoAuditoria } from "@/lib/validation/auditoria";
import type { AcaoAuditoria } from "@/lib/supabase/types";

import { AuditoriaLista } from "./auditoria-lista";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();

  // auditoria_select_adm_master (RLS) só libera leitura pra adm_master —
  // nem adm comum vê esta tela.
  if (usuario.perfil !== "adm_master") {
    redirect("/");
  }

  const sp = await searchParams;
  const tabela = typeof sp.tabela === "string" && sp.tabela !== "todas" ? sp.tabela : undefined;
  const acao: AcaoAuditoria | undefined =
    typeof sp.acao === "string" && isAcaoAuditoria(sp.acao) ? sp.acao : undefined;

  const registros = await listarAuditoria({ tabela, acao });

  return <AuditoriaLista registros={registros} filtros={{ tabela, acao }} />;
}
