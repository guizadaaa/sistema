import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS } from "@/lib/labels";
import { carregarMetricasPainel, STATUS_ORDEM } from "@/lib/painel/metricas";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";

export default async function PainelPage() {
  const usuario = await requireCurrentUser();

  // Painel de Gestão é para quem gerencia operação (gerente e admin) — o
  // vendedor já tem o Dashboard com o recorte que importa pra ele.
  if (usuario.perfil === "vendedor") {
    redirect("/");
  }

  const metricas = await carregarMetricasPainel();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Painel de Gestão</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 py-4">
            <span className="text-muted-foreground text-sm">Total de protocolos</span>
            <span className="text-3xl font-semibold">{metricas.total}</span>
          </CardContent>
        </Card>
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
    </div>
  );
}
