import type { NextRequest } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { FILIAL_LABELS } from "@/lib/labels";
import { carregarMetricasPainel, listarVendedoresParaFiltro } from "@/lib/painel/metricas";
import { gerarPainelPdf } from "@/lib/relatorios/painel-pdf";
import type { FilialCvc } from "@/lib/supabase/types";

import { isFilialCvc } from "../../../casos/casos-lista";

/**
 * Mesmo gate de perfil da página /painel (vendedor não tem acesso a este
 * relatório) e mesmos filtros — a exportação é só o que já está na tela,
 * em PDF. carregarMetricasPainel usa o client autenticado normal (RLS
 * escopando por perfil), nunca o admin client.
 */
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

  let vendedorNome: string | undefined;
  if (vendedorId) {
    const vendedores = await listarVendedoresParaFiltro(filial);
    vendedorNome = vendedores.find((v) => v.id === vendedorId)?.nome;
  }

  const pdf = await gerarPainelPdf(metricas, {
    filial: filial ? FILIAL_LABELS[filial] : undefined,
    vendedorNome,
    dataInicio,
    dataFim,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="painel-de-gestao.pdf"',
    },
  });
}
