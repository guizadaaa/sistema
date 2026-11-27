import Link from "next/link";
import { Download, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/current-user";
import type { CasoEmAberto } from "@/lib/dashboard/em-aberto";
import { carregarPaginaInicial } from "@/lib/dashboard/metricas";
import { gruposPorVendedor, LOJAS_INICIO, linhasPorFilial, somar, tempoNaEtapa } from "@/lib/dashboard/tabela-status";
import { FILIAL_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { CasosEmAberto } from "./casos-em-aberto";
import { TabelaStatus } from "./tabela-status";

/** Pílula da linha do título: número + texto, clicável (abre Acompanhar Casos filtrado). */
function Pilula({ href, n, texto, tom, testId }: { href: string; n: number; texto: string; tom: "neutro" | "vermelho" | "laranja"; testId: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-label={`${n} ${texto}: abrir a lista`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        tom === "neutro" && "hover:bg-accent",
        tom === "vermelho" && "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400",
        tom === "laranja" && "border-orange-500/40 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-400"
      )}
    >
      <strong className="tabular-nums">{n}</strong> {texto}
    </Link>
  );
}

/**
 * Página inicial: cabe numa tela de notebook sem rolar (lg: altura da janela
 * menos o menu); só os cards rolam por dentro. Em tela estreita os blocos
 * empilham e a página rola normalmente.
 */
export default async function HomePage() {
  const usuario = await requireCurrentUser();
  const { contagens, candidatos, emAberto } = await carregarPaginaInicial(8);
  const agora = new Date();
  const comTempo = (casos: CasoEmAberto[]) => casos.map((c) => ({ ...c, naEtapa: tempoNaEtapa(c.entrouEm, agora) }));

  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const ehGerente = usuario.perfil === "gerente";
  const lojas = ehAdmin ? LOJAS_INICIO : usuario.filial ? [usuario.filial] : [];
  const rotuloLoja = (l: (typeof LOJAS_INICIO)[number]) => FILIAL_LABELS[l];
  const total = somar(contagens);
  const porFilial = ehAdmin || ehGerente ? linhasPorFilial(contagens, candidatos, lojas, rotuloLoja) : [];
  const porVendedor = ehAdmin || ehGerente ? gruposPorVendedor(contagens, candidatos, lojas, rotuloLoja) : [];

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100svh-6rem)] lg:min-h-[30rem]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-1 text-xl font-semibold">Bem-vindo(a), {usuario.nome_completo}</h1>
        <div className="flex flex-wrap items-center gap-2" data-testid="indicadores">
          <Pilula href="/casos?aberto=1" n={total.emAberto} texto="em aberto" tom="neutro" testId="pilula-aberto" />
          <Pilula href="/casos?prazo=vencido" n={total.vencidos} texto={total.vencidos === 1 ? "vencido" : "vencidos"} tom="vermelho" testId="pilula-vencidos" />
          <Pilula
            href="/casos?prazo=vence5"
            n={total.vencem5}
            texto={`${total.vencem5 === 1 ? "vence" : "vencem"} em até 5 dias`}
            tom="laranja"
            testId="pilula-vence5"
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/casos/novo">
              <Plus /> Adicionar caso
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/casos">Acompanhar casos</Link>
          </Button>
          {usuario.perfil === "vendedor" && (
            <Button asChild variant="outline">
              <a href={`/painel/extrato-vendedor/${usuario.id}`}>
                <Download /> Baixar meu extrato
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="relative gap-3 py-4 lg:min-h-0" data-testid="card-status">
          <CardHeader className="px-4">
            <CardTitle>Casos por status</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-4">
            <TabelaStatus
              porFilial={porFilial}
              porVendedor={porVendedor}
              total={total}
              rotuloTotal={ehAdmin ? "Total" : ehGerente ? "Total da loja" : "Seus casos"}
              comChave={ehAdmin}
              agruparInicial={ehGerente ? "vendedor" : "filial"}
            />
          </CardContent>
        </Card>

        <Card className="relative gap-3 py-4 lg:min-h-0" data-testid="card-em-aberto">
          <CardHeader className="px-4">
            <CardTitle>Casos em aberto</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-4">
            <CasosEmAberto grau={comTempo(emAberto.grau)} parado={comTempo(emAberto.parado)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
