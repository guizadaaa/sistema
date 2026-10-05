import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarCasos } from "@/lib/casos/listar";
import { listarOpcoesVendedorFiltro } from "@/lib/casos/nomes";
import { createClient } from "@/lib/supabase/server";

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
  const dataInicio = typeof sp.dataInicio === "string" ? sp.dataInicio : undefined;
  const dataFim = typeof sp.dataFim === "string" ? sp.dataFim : undefined;
  const ehAdmMaster = usuario.perfil === "adm_master";
  const mostrarTeste = ehAdmMaster && sp.mostrarTeste === "1";

  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Opções já vêm limitadas pelo banco (vendedores_filtro_casos): própria
  // filial para vendedor/gerente; para admin, a filial filtrada (ou todas).
  // Um id na URL fora dessas opções é ignorado em vez de aplicado.
  const opcoesVendedor = await listarOpcoesVendedorFiltro(await createClient(), mostrarFiltroFilial ? filial : undefined);
  const vendedor =
    typeof sp.vendedor === "string" && opcoesVendedor.some((o) => o.id === sp.vendedor) ? sp.vendedor : undefined;

  const casos = await listarCasos({ status, tipo, filial, vendedor, busca, dataInicio, dataFim, mostrarTeste });

  return (
    <CasosLista
      casos={casos}
      filtros={{ status, tipo, filial, vendedor, busca, dataInicio, dataFim, mostrarTeste }}
      opcoesVendedor={opcoesVendedor}
      mostrarFiltroFilial={mostrarFiltroFilial}
      ehAdmMaster={ehAdmMaster}
    />
  );
}
