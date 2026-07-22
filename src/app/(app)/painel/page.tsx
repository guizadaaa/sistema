import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FILIAL_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { carregarMetricasPainel, STATUS_ORDEM } from "@/lib/painel/metricas";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { TIPOS_CASO } from "@/lib/validation/caso";

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
    </div>
  );
}
