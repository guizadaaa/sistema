import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listarCliquesPorPeriodo, listarCliquesVitrine, listarResumoPorVendedor } from "@/lib/linkly/listar";

import { CliquesTabs } from "./cliques-tabs";
import { AtualizarAgoraBotao, ResumoPorVendedorTabela, TabelaPeriodos, VitrineCard } from "./cliques-view";

export default async function CliquesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const sp = await searchParams;

  const mostrarFiltroFilial = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const podeAtualizar = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Vendedor: só os próprios períodos, sem drill-down.
  if (usuario.perfil === "vendedor") {
    const periodos = await listarCliquesPorPeriodo({ vendedorId: usuario.id });
    const total = periodos.reduce((soma, p) => soma + p.cliquesPeriodo, 0);

    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Meus cliques</h1>
        <TabelaPeriodos periodos={periodos} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master com um vendedor selecionado: detalhe por período.
  const vendedorId = typeof sp.vendedorId === "string" ? sp.vendedorId : undefined;
  if (vendedorId) {
    const periodos = await listarCliquesPorPeriodo({ vendedorId });
    const total = periodos.reduce((soma, p) => soma + p.cliquesPeriodo, 0);
    const nomeVendedor = typeof sp.vendedorNome === "string" ? sp.vendedorNome : "Vendedor";

    return (
      <div className="flex flex-col gap-4">
        <CliquesTabs ativo="cliques" perfil={usuario.perfil} />
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Cliques de {nomeVendedor}</h1>
          <Button asChild variant="ghost" size="sm">
            <Link href="/cliques">← Voltar ao resumo</Link>
          </Button>
        </div>
        <TabelaPeriodos periodos={periodos} total={total} />
      </div>
    );
  }

  // Gerente/adm/adm_master sem vendedor selecionado: resumo agregado.
  const resumo = await listarResumoPorVendedor({});
  // Só gerente/adm/adm_master chegam até aqui (vendedor já retornou acima).
  // linkly_cliques_vitrine já restringe por RLS: gerente vê só a própria
  // loja, adm/adm_master veem as 3.
  const vitrine = await listarCliquesVitrine();

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="cliques" perfil={usuario.perfil} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cliques por vendedor</h1>
        {podeAtualizar && <AtualizarAgoraBotao />}
      </div>

      <ResumoPorVendedorTabela resumo={resumo} mostrarFiltroFilial={mostrarFiltroFilial} />

      {vitrine.length > 0 && <VitrineCard vitrine={vitrine} />}

      {usuario.perfil === "adm_master" && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cadastro de links e atribuição de vendedores.</span>
            <Button asChild variant="outline" size="sm">
              <Link href="/cliques/mapeamento">Ver mapeamento</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
