import Link from "next/link";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import { FILIAL_LABELS, QUEM_PAGA_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { carregarMetricasPainel, STATUS_ORDEM } from "@/lib/painel/metricas";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { TIPOS_CASO } from "@/lib/validation/caso";

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function PainelPage() {
  const usuario = await requireCurrentUser();

  // Painel de Gestão é para quem gerencia operação (gerente e admin) — o
  // vendedor já tem o Dashboard com o recorte que importa pra ele.
  if (usuario.perfil === "vendedor") {
    redirect("/");
  }

  const metricas = await carregarMetricasPainel();
  const tiposOrdenados = [...TIPOS_CASO].sort((a, b) => metricas.porTipo[b] - metricas.porTipo[a]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Painel de Gestão</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile titulo="Total de protocolos" valor={metricas.total} />
        <StatTile titulo="Prazo vencido" valor={metricas.prazoVencidos} tom="destructive" />
        <StatTile titulo="Vencendo em breve" valor={metricas.prazoVencendo} tom="atencao" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Casos por status</CardTitle>
          <CardDescription>Total: {metricas.total}</CardDescription>
        </CardHeader>
        <CardContent>
          {metricas.total === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum caso encontrado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {STATUS_ORDEM.map((status) => (
                <li key={status} className="flex items-center justify-between text-sm">
                  <Badge className={STATUS_BADGE_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
                  <span className="font-medium">{metricas.porStatus[status]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de caso mais comuns</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {metricas.total === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum caso encontrado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tiposOrdenados.map((tipo) => (
                <li key={tipo} className="flex items-center justify-between text-sm">
                  <span>{TIPO_CASO_LABELS[tipo]}</span>
                  <span className="font-medium">{metricas.porTipo[tipo]}</span>
                </li>
              ))}
            </ul>
          )}

          {metricas.tipoMaisComumPorFilial.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Por loja</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Filial</th>
                    <th className="py-2 pr-4 font-medium">Tipo mais comum</th>
                    <th className="py-2 pr-4 font-medium">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.tipoMaisComumPorFilial.map((f) => (
                    <tr key={f.filial} className="border-b last:border-0">
                      <td className="py-2 pr-4">{FILIAL_LABELS[f.filial]}</td>
                      <td className="py-2 pr-4">{TIPO_CASO_LABELS[f.tipo]}</td>
                      <td className="py-2 pr-4">{f.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {metricas.tipoMaisComumPorVendedor.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Por vendedor</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Vendedor</th>
                    <th className="py-2 pr-4 font-medium">Tipo mais comum</th>
                    <th className="py-2 pr-4 font-medium">Total de casos</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.tipoMaisComumPorVendedor.map((v) => (
                    <tr key={v.vendedorId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{v.vendedorNome}</td>
                      <td className="py-2 pr-4">{TIPO_CASO_LABELS[v.tipo]}</td>
                      <td className="py-2 pr-4">{v.totalCasos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Casos que precisam de atenção</CardTitle>
          <CardDescription>Prazo de vigência vencido ou vencendo nos próximos dias</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {metricas.casosAtencaoPrazo.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum caso com prazo vencido ou vencendo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Protocolo</th>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Vendedor</th>
                  <th className="py-2 pr-4 font-medium">Prazo de vigência</th>
                </tr>
              </thead>
              <tbody>
                {metricas.casosAtencaoPrazo.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-4">
                      <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                        #{c.protocolo}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{c.clienteNome}</td>
                    <td className="py-2 pr-4">{c.vendedorNome}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          c.situacao === "vencido" ? "text-destructive font-medium" : "font-medium text-amber-600 dark:text-amber-500"
                        }
                      >
                        {formatarData(c.prazoVigencia)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Multa total</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="text-3xl font-semibold">{formatarMoeda(metricas.multaTotal)}</span>
            <ul className="flex flex-col gap-2 text-sm">
              {(Object.keys(metricas.multaPorQuemPaga) as (keyof typeof metricas.multaPorQuemPaga)[]).map((quemPaga) => (
                <li key={quemPaga} className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paga pelo {QUEM_PAGA_LABELS[quemPaga].toLowerCase()}</span>
                  <span className="font-medium">{formatarMoeda(metricas.multaPorQuemPaga[quemPaga])}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxas de remarcação</CardTitle>
            <CardDescription>Natureza diferente de multa contratual — custo real de remarcações com custo</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Taxas</span>
                <span className="font-medium">{formatarMoeda(metricas.taxasRemarcacao.taxas)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Diferença tarifária</span>
                <span className="font-medium">{formatarMoeda(metricas.taxasRemarcacao.diferencaTarifaria)}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
