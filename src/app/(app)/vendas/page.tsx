import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listarResumoPorVendedor, listarVendas } from "@/lib/vendas/listar";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

import { VendasTabs } from "./vendas-tabs";
import { AvisoValoresBrutos, FiltroPeriodo, ResumoPorVendedorTabela, TabelaVendas } from "./vendas-view";

function isFilialCvc(v: string): v is FilialCvc {
  return (FILIAIS as readonly string[]).includes(v);
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const sp = await searchParams;

  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const filial = mostrarFiltroFilial && typeof sp.filial === "string" && isFilialCvc(sp.filial) ? sp.filial : undefined;
  const dataInicio = typeof sp.dataInicio === "string" ? sp.dataInicio : undefined;
  const dataFim = typeof sp.dataFim === "string" ? sp.dataFim : undefined;

  // Vendedor: só a própria lista, sem drill-down nem filtro de filial.
  if (usuario.perfil === "vendedor") {
    const vendas = await listarVendas({ vendedorId: usuario.id, dataInicio, dataFim });
    const total = vendas.reduce((soma, v) => soma + v.valorTotal, 0);

    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Minhas vendas</h1>
        <AvisoValoresBrutos />
        <FiltroPeriodo mostrarFiltroFilial={false} dataInicio={dataInicio} dataFim={dataFim} />
        <TabelaVendas vendas={vendas} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master com um vendedor selecionado: mesma tabela de
  // detalhe, mas de outra pessoa — com um link de volta pro resumo.
  const vendedorId = typeof sp.vendedorId === "string" ? sp.vendedorId : undefined;
  if (vendedorId) {
    const vendas = await listarVendas({ vendedorId, filial, dataInicio, dataFim });
    const total = vendas.reduce((soma, v) => soma + v.valorTotal, 0);
    const nomeVendedor = typeof sp.vendedorNome === "string" ? sp.vendedorNome : "Vendedor";

    return (
      <div className="flex flex-col gap-4">
        <VendasTabs ativo="vendas" perfil={usuario.perfil} />
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Vendas de {nomeVendedor}</h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/vendas">← Voltar ao resumo</Link>
          </Button>
        </div>
        <AvisoValoresBrutos />
        <FiltroPeriodo mostrarFiltroFilial={mostrarFiltroFilial} filial={filial} dataInicio={dataInicio} dataFim={dataFim} />
        <TabelaVendas vendas={vendas} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master sem vendedor selecionado: resumo agregado.
  const resumo = await listarResumoPorVendedor({ filial, dataInicio, dataFim });

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="vendas" perfil={usuario.perfil} />
      <h1 className="text-xl font-semibold">Vendas por vendedor</h1>
      <AvisoValoresBrutos />
      <FiltroPeriodo mostrarFiltroFilial={mostrarFiltroFilial} filial={filial} dataInicio={dataInicio} dataFim={dataFim} />
      <ResumoPorVendedorTabela
        resumo={resumo}
        mostrarFiltroFilial={mostrarFiltroFilial}
        filial={filial}
        dataInicio={dataInicio}
        dataFim={dataFim}
      />

      {usuario.perfil === "adm_master" && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Nomes de vendedor sem vínculo com nenhum usuário aparecem aqui excluídos deste resumo.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/vendas/mapeamento">Ver pendentes de vínculo</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
