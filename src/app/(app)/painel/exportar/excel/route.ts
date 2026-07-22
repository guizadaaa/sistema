import type { NextRequest } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { carregarMetricasPainel } from "@/lib/painel/metricas";
import { gerarPainelExcel } from "@/lib/relatorios/painel-excel";
import type { FilialCvc } from "@/lib/supabase/types";

import { isFilialCvc } from "../../../casos/casos-lista";

/** Mesmo gate/filtros de /painel/exportar/pdf — ver comentário lá. */
export async function GET(request: NextRequest) {
  const usuario = await requireCurrentUser();

  if (usuario.perfil === "vendedor") {
    return new Response("Sem permissão para exportar o Painel de Gestão.", { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const filialParam = sp.get("filial");
  const filial: FilialCvc | undefined =
    mostrarFiltroFilial && filialParam && isFilialCvc(filialParam) ? filialParam : undefined;
  const vendedorId = sp.get("vendedorId") ?? undefined;
  const dataInicio = sp.get("dataInicio") ?? undefined;
  const dataFim = sp.get("dataFim") ?? undefined;

  const metricas = await carregarMetricasPainel({ filial, vendedorId, dataInicio, dataFim });
  const excel = await gerarPainelExcel(metricas);

  return new Response(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="painel-de-gestao.xlsx"',
    },
  });
}
