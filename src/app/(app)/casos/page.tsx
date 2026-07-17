import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarCasos } from "@/lib/casos/listar";

import { CasosLista, isFilialCvc, isStatusCaso, isTipoCaso } from "./casos-lista";

export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const sp = await searchParams;

  const status = typeof sp.status === "string" && isStatusCaso(sp.status) ? sp.status : undefined;
  const tipo = typeof sp.tipo === "string" && isTipoCaso(sp.tipo) ? sp.tipo : undefined;
  const filial = typeof sp.filial === "string" && isFilialCvc(sp.filial) ? sp.filial : undefined;
  const busca = typeof sp.busca === "string" ? sp.busca : undefined;

  const casos = await listarCasos({ status, tipo, filial, busca });
  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  return (
    <CasosLista
      casos={casos}
      filtros={{ status, tipo, filial, busca }}
      mostrarFiltroFilial={mostrarFiltroFilial}
    />
  );
}
