import { requireCurrentUser } from "@/lib/auth/current-user";
import { lerOrdemFiltro, lerPrazoFiltro } from "@/lib/casos/barra-status";
import { lerPrioridadeFiltro } from "@/lib/casos/prioridade";
import { contarCasosPorStatus, listarCasos } from "@/lib/casos/listar";
import { listarCandidatosVendedor } from "@/lib/casos/nomes";
import { vendedorNaFilial } from "@/lib/casos/opcoes-vendedor";
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
  const prazo = lerPrazoFiltro(sp.prazo);
  const aberto = sp.aberto === "1" || undefined;
  const ordem = lerOrdemFiltro(sp.ordem);
  const prioridade = lerPrioridadeFiltro(sp.prioridade);

  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Candidatos limitados pelo banco (vendedores_filtro_casos_lojas): admin
  // todas as filiais; gerente/vendedor a própria. O vendedor da URL só vale se
  // existir nas opções da Filial (link antigo incompatível → "Todos").
  const candidatosVendedor = await listarCandidatosVendedor(await createClient());
  const filialDoVendedor = mostrarFiltroFilial ? filial : (usuario.filial ?? undefined);
  const vendedor =
    typeof sp.vendedor === "string" && vendedorNaFilial(candidatosVendedor, filialDoVendedor, sp.vendedor) ? sp.vendedor : undefined;

  const filtros = { status, tipo, filial, vendedor, busca, dataInicio, dataFim, mostrarTeste, prazo, aberto, prioridade, ordem };
  // A barra conta com os mesmos filtros, menos o Status.
  const [casos, contagem] = await Promise.all([listarCasos(filtros), contarCasosPorStatus({ ...filtros, status: undefined })]);

  return (
    <CasosLista
      casos={casos}
      filtros={filtros}
      contagem={contagem}
      candidatosVendedor={candidatosVendedor}
      filialUsuario={usuario.filial ?? undefined}
      mostrarFiltroFilial={mostrarFiltroFilial}
      ehAdmMaster={ehAdmMaster}
    />
  );
}
