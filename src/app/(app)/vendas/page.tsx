import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { somarDias } from "@/lib/feriados/dia-util";
import { listarFeriados, paraFeriado } from "@/lib/feriados/listar";
import { hojeSaoPaulo } from "@/lib/linkly/mes";
import { listarReferenciasVendas, listarResumoPorVendedor, listarVendas } from "@/lib/vendas/listar";
import { montarPeriodoVendas } from "@/lib/vendas/mes-referencia";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

import { VendasTabs } from "./vendas-tabs";
import { AvisoValoresBrutos, FiltroPeriodo, ResumoPorVendedorTabela, RotuloPeriodo, TabelaVendas } from "./vendas-view";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

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
  const dataInicio = typeof sp.dataInicio === "string" && DATA.test(sp.dataInicio) ? sp.dataInicio : undefined;
  const dataFim = typeof sp.dataFim === "string" && DATA.test(sp.dataFim) ? sp.dataFim : undefined;

  // Sem período escolhido: cada filial no mês da última importação dela
  // (1º do mês até "vendas até"). Lojas visíveis vêm do banco pelo perfil.
  const hoje = hojeSaoPaulo();
  const [referencias, feriados] = await Promise.all([listarReferenciasVendas(), listarFeriados(somarDias(hoje, -45), hoje)]);
  const lojas = filial ? [filial] : referencias.map((r) => r.loja);
  const periodo = montarPeriodoVendas({ lojas, referencias, hoje, feriados: feriados.map(paraFeriado), dataInicio, dataFim });
  const voltar = (extra: Record<string, string> = {}) =>
    `/vendas?${new URLSearchParams({ ...(filial ? { filial } : {}), ...extra }).toString()}`;

  // Vendedor: só a própria lista, sem drill-down nem filtro de filial.
  if (usuario.perfil === "vendedor") {
    const vendas = await listarVendas({ vendedorId: usuario.id, periodos: periodo.periodos });
    const total = vendas.reduce((soma, v) => soma + v.valorTotal, 0);

    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Minhas vendas</h1>
        <AvisoValoresBrutos />
        <FiltroPeriodo mostrarFiltroFilial={false} dataInicio={dataInicio} dataFim={dataFim} />
        <RotuloPeriodo periodo={periodo} voltarHref={voltar()} />
        <TabelaVendas vendas={vendas} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master com um vendedor selecionado: mesma tabela de
  // detalhe, mas de outra pessoa — com um link de volta pro resumo.
  const vendedorId = typeof sp.vendedorId === "string" ? sp.vendedorId : undefined;
  if (vendedorId) {
    const vendas = await listarVendas({ vendedorId, periodos: periodo.periodos });
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
        <RotuloPeriodo periodo={periodo} voltarHref={voltar({ vendedorId, vendedorNome: nomeVendedor })} />
        <TabelaVendas vendas={vendas} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master sem vendedor selecionado: resumo agregado.
  const resumo = await listarResumoPorVendedor(periodo.periodos);

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="vendas" perfil={usuario.perfil} />
      <h1 className="text-xl font-semibold">Vendas por vendedor</h1>
      <AvisoValoresBrutos />
      <FiltroPeriodo mostrarFiltroFilial={mostrarFiltroFilial} filial={filial} dataInicio={dataInicio} dataFim={dataFim} />
      <RotuloPeriodo periodo={periodo} voltarHref={voltar()} />
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
