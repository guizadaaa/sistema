import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buscarUltimaSincronizacao,
  listarCliquesDoMes,
  listarMesesComRegistro,
  listarResumoPorVendedorDoMes,
  listarVitrineDoMes,
} from "@/lib/linkly/listar";
import { mesAtualSaoPaulo, opcoesDeMes, parametroMes, resolverMes, sincronizacaoAtrasada } from "@/lib/linkly/mes";

import { CliquesTabs } from "./cliques-tabs";
import {
  AtualizarAgoraBotao,
  AutoAtualizar,
  ResumoPorVendedorMes,
  SeletorMes,
  StatusSincronizacao,
  TabelaCliquesMes,
  VitrineMesCard,
} from "./cliques-view";

export default async function CliquesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const sp = await searchParams;

  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Mês: padrão é o atual (São Paulo); anteriores só se houver registro.
  const [mesesComRegistro, ultimaSincronizacao] = await Promise.all([listarMesesComRegistro(), buscarUltimaSincronizacao()]);
  const mesAtual = mesAtualSaoPaulo();
  const mes = resolverMes(sp.mes, mesesComRegistro, mesAtual);
  const opcoes = opcoesDeMes(mesesComRegistro, mesAtual);

  const cabecalho = (titulo: string, extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <SeletorMes mes={mes} opcoes={opcoes} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusSincronizacao
          ultima={ultimaSincronizacao}
          atrasada={sincronizacaoAtrasada(ultimaSincronizacao)}
          mostrarAlerta={ehAdmin}
        />
        {extra}
      </div>
    </div>
  );

  // Vendedor: só os próprios trechos do mês (a função do banco já restringe).
  if (usuario.perfil === "vendedor") {
    const linhas = await listarCliquesDoMes(mes);
    return (
      <div className="flex flex-col gap-4">
        <AutoAtualizar />
        {cabecalho("Meus cliques")}
        <TabelaCliquesMes linhas={linhas} mes={mes} />
      </div>
    );
  }

  // Gerente/adm/adm_master com um vendedor selecionado: detalhe por link.
  const vendedorId = typeof sp.vendedorId === "string" ? sp.vendedorId : undefined;
  if (vendedorId) {
    const linhas = await listarCliquesDoMes(mes, { vendedorId });
    const nomeVendedor = typeof sp.vendedorNome === "string" ? sp.vendedorNome : "Vendedor";

    return (
      <div className="flex flex-col gap-4">
        <AutoAtualizar />
        <CliquesTabs ativo="cliques" perfil={usuario.perfil} />
        {cabecalho(
          `Cliques de ${nomeVendedor}`,
          <Button asChild variant="ghost" size="sm">
            <Link href={`/cliques?mes=${parametroMes(mes)}`}>← Voltar ao resumo</Link>
          </Button>
        )}
        <TabelaCliquesMes linhas={linhas} mes={mes} />
      </div>
    );
  }

  // Resumo do mês por vendedor + vitrine (vitrine: a função restringe a
  // admin e ao gerente da própria loja).
  const [resumo, vitrine] = await Promise.all([listarResumoPorVendedorDoMes(mes), listarVitrineDoMes(mes)]);

  return (
    <div className="flex flex-col gap-4">
      <AutoAtualizar />
      <CliquesTabs ativo="cliques" perfil={usuario.perfil} />
      {cabecalho("Cliques por vendedor", ehAdmin ? <AtualizarAgoraBotao /> : undefined)}

      <ResumoPorVendedorMes resumo={resumo} mes={mes} mostrarFilial={ehAdmin} />

      <VitrineMesCard vitrine={vitrine} mes={mes} />

      {usuario.perfil === "adm_master" && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cadastro de links, atribuição de vendedores e base do mês.</span>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/cliques/mapeamento">Ver mapeamento</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/cliques/base">Definir base do mês</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
