import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatarDataBr, formatarMoeda } from "@/lib/formatacao";
import { FILIAL_LABELS } from "@/lib/labels";
import type { ResumoVendedor, VendaListada } from "@/lib/vendas/listar";
import { FILIAIS } from "@/lib/validation/caso";
import type { FilialCvc } from "@/lib/supabase/types";

export const AVISO_VALORES_BRUTOS = "Os valores exibidos são brutos (Valor Total da venda), não líquidos.";

export function AvisoValoresBrutos() {
  return <p className="text-muted-foreground rounded-md border border-dashed p-2 text-sm">⚠️ {AVISO_VALORES_BRUTOS}</p>;
}

export function FiltroPeriodo({
  mostrarFiltroFilial,
  filial,
  dataInicio,
  dataFim,
}: {
  mostrarFiltroFilial: boolean;
  filial?: FilialCvc;
  dataInicio?: string;
  dataFim?: string;
}) {
  return (
    <Card>
      <CardContent>
        <form method="get" className="flex flex-wrap items-end gap-3">
          {mostrarFiltroFilial && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Filial</label>
              <Select name="filial" defaultValue={filial ?? "todas"}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {FILIAIS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FILIAL_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Período</label>
            <DateRangePicker
              nomeInicio="dataInicio"
              nomeFim="dataFim"
              valorInicialInicio={dataInicio}
              valorInicialFim={dataFim}
            />
          </div>

          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function TabelaVendas({ vendas, total }: { vendas: VendaListada[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Vendas</span>
          <Badge variant="outline" className="text-sm font-medium">
            Total: {formatarMoeda(total)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {vendas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma venda encontrada no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Pagante</th>
                <th className="py-2 pr-4 font-medium">Produto</th>
                <th className="py-2 pr-4 font-medium">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{formatarDataBr(v.dataVenda)}</td>
                  <td className="py-2 pr-4">{v.pagante}</td>
                  <td className="py-2 pr-4">{v.produto}</td>
                  <td className="py-2 pr-4">{formatarMoeda(v.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumoPorVendedorTabela({
  resumo,
  mostrarFiltroFilial,
  filial,
  dataInicio,
  dataFim,
}: {
  resumo: ResumoVendedor[];
  mostrarFiltroFilial: boolean;
  filial?: FilialCvc;
  dataInicio?: string;
  dataFim?: string;
}) {
  const totalGeral = resumo.reduce((soma, r) => soma + r.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Resumo por vendedor</span>
          <span className="text-base font-medium">Total: {formatarMoeda(totalGeral)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {resumo.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma venda encontrada no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Vendedor</th>
                {mostrarFiltroFilial && <th className="py-2 pr-4 font-medium">Filial</th>}
                <th className="py-2 pr-4 font-medium">Vendas</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => {
                const query = new URLSearchParams({
                  vendedorId: r.vendedorId,
                  vendedorNome: r.vendedorNome,
                  ...(filial ? { filial } : {}),
                  ...(dataInicio ? { dataInicio } : {}),
                  ...(dataFim ? { dataFim } : {}),
                });
                return (
                  <tr key={r.vendedorId} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-4">{r.vendedorNome}</td>
                    {mostrarFiltroFilial && <td className="py-2 pr-4">{FILIAL_LABELS[r.filial]}</td>}
                    <td className="py-2 pr-4">{r.quantidade}</td>
                    <td className="py-2 pr-4">{formatarMoeda(r.total)}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/vendas?${query.toString()}`} className="text-sm font-medium hover:underline">
                        Ver vendas
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
