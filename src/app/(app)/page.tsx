import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { carregarMetricasDashboard, STATUS_ORDEM } from "@/lib/dashboard/metricas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/labels";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { StatTile } from "@/components/stat-tile";

export default async function HomePage() {
  const usuario = await requireCurrentUser();
  const metricas = await carregarMetricasDashboard();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bem-vindo(a), {usuario.nome_completo}</h1>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/casos/novo">Adicionar caso</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/casos">Acompanhar casos</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile titulo="Casos em aberto" valor={metricas.total - metricas.porStatus.resolvido} />
        <StatTile titulo="Prazo vencido" valor={metricas.prazoVencidos} tom="destructive" />
        <StatTile titulo="Vencendo em breve" valor={metricas.prazoVencendo} tom="atencao" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <CardTitle>Parados há mais tempo</CardTitle>
            <CardDescription>Casos com mais tempo na etapa atual</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {metricas.casosParados.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum caso encontrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Protocolo</th>
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Tempo na etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.casosParados.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="py-2 pr-4">
                        <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                          #{c.protocolo}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{c.clienteNome}</td>
                      <td className="py-2 pr-4">
                        <Badge className={STATUS_BADGE_CLASSES[c.statusAtual]}>{STATUS_LABELS[c.statusAtual]}</Badge>
                      </td>
                      <td className="py-2 pr-4">{c.duracaoTexto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
