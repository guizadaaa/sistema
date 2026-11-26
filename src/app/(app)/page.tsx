import Link from "next/link";
import { ArrowRight, Download, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { carregarPaginaInicial } from "@/lib/dashboard/metricas";
import { gruposPorVendedor, LOJAS_INICIO, linhasPorFilial, somar, tempoNaEtapa } from "@/lib/dashboard/tabela-status";
import { FILIAL_LABELS, STATUS_LABELS } from "@/lib/labels";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

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
  const { contagens, candidatos, parados } = await carregarPaginaInicial(8);

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

        <Card className="gap-3 py-4 lg:min-h-0" data-testid="card-parados">
          <CardHeader className="px-4">
            <CardTitle>Parados há mais tempo</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4">
            {parados.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum caso em aberto.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="text-muted-foreground grid grid-cols-[4.5rem_1fr_auto] gap-2 border-b pb-1 text-xs font-medium">
                  <span>Protocolo</span>
                  <span>Cliente</span>
                  <span className="text-right">Na etapa</span>
                </div>
                <ul>
                  {parados.map((c) => (
                    <li key={c.id} className="border-b last:border-0">
                      <Link
                        href={`/casos/${c.id}`}
                        className="hover:bg-accent/50 grid grid-cols-[4.5rem_1fr_auto] items-start gap-2 py-1.5 text-sm"
                        data-testid="parado"
                      >
                        <span className="font-medium">#{c.protocolo}</span>
                        <span className="min-w-0">
                          <span className="block truncate">{c.clienteNome}</span>
                          <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            <Badge className={cn("px-1.5 py-0 text-[10px]", STATUS_BADGE_CLASSES[c.statusAtual])}>{STATUS_LABELS[c.statusAtual]}</Badge>
                            {c.filial}
                          </span>
                        </span>
                        <span className="text-right text-xs whitespace-nowrap">{tempoNaEtapa(c.entrouEm)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/casos?aberto=1&ordem=parado" className="text-primary mt-auto flex items-center gap-1 self-end text-sm hover:underline" data-testid="ver-todos-parados">
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
