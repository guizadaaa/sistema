import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { situacaoPrazoVigencia } from "@/lib/casos/prazo";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import type { CasoListado } from "@/lib/casos/listar";
import { TIPOS_CASO } from "@/lib/validation/caso";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export const STATUS_OPCOES: StatusCaso[] = [
  "inicial",
  "recepcionado",
  "em_andamento_interno",
  "reavaliacao",
  "resolvido",
  "ouvidoria",
];

export const FILIAL_OPCOES: FilialCvc[] = ["1710", "1714", "1730"];

export function isStatusCaso(v: string): v is StatusCaso {
  return (STATUS_OPCOES as string[]).includes(v);
}
export function isTipoCaso(v: string): v is TipoCaso {
  return (TIPOS_CASO as readonly string[]).includes(v);
}
export function isFilialCvc(v: string): v is FilialCvc {
  return (FILIAL_OPCOES as string[]).includes(v);
}

export function CasosLista({
  casos,
  filtros,
  mostrarFiltroFilial,
}: {
  casos: CasoListado[];
  filtros: {
    status?: StatusCaso;
    tipo?: TipoCaso;
    filial?: FilialCvc;
    busca?: string;
    cpf?: string;
    contrato?: string;
    dataInicio?: string;
    dataFim?: string;
  };
  mostrarFiltroFilial: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Acompanhar Casos</h1>
        <Button asChild>
          <Link href="/casos/novo">Adicionar caso</Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="busca">
                Buscar
              </label>
              <Input
                id="busca"
                name="busca"
                placeholder="Contrato, cliente ou protocolo"
                defaultValue={filtros.busca ?? ""}
                className="w-56"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Status</label>
              <Select name="status" defaultValue={filtros.status ?? "todos"}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {STATUS_OPCOES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Tipo</label>
              <Select name="tipo" defaultValue={filtros.tipo ?? "todos"}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {TIPOS_CASO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_CASO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mostrarFiltroFilial && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Filial</label>
                <Select name="filial" defaultValue={filtros.filial ?? "todas"}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {FILIAL_OPCOES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FILIAL_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="cpf">
                CPF do cliente
              </label>
              <Input
                id="cpf"
                name="cpf"
                placeholder="000.000.000-00"
                defaultValue={filtros.cpf ?? ""}
                className="w-44"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="contrato">
                Número de contrato
              </label>
              <Input
                id="contrato"
                name="contrato"
                placeholder="Principal ou adicional"
                defaultValue={filtros.contrato ?? ""}
                className="w-44"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="dataInicio">
                Aberto de
              </label>
              <Input id="dataInicio" name="dataInicio" type="date" defaultValue={filtros.dataInicio ?? ""} className="w-40" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="dataFim">
                até
              </label>
              <Input id="dataFim" name="dataFim" type="date" defaultValue={filtros.dataFim ?? ""} className="w-40" />
            </div>

            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto">
          {casos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum caso encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Protocolo</th>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Dono</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Prazo de vigência</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => {
                  const situacao = situacaoPrazoVigencia(c.prazo_vigencia);
                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="py-2 pr-4">
                        <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                          #{c.protocolo}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{TIPO_CASO_LABELS[c.tipo_caso]}</td>
                      <td className="py-2 pr-4">{c.cliente_nome}</td>
                      <td className="py-2 pr-4">{c.donoNome}</td>
                      <td className="py-2 pr-4">
                        <Badge className={STATUS_BADGE_CLASSES[c.status_atual]}>{STATUS_LABELS[c.status_atual]}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            situacao === "vencido"
                              ? "text-destructive font-medium"
                              : situacao === "vencendo"
                                ? "font-medium text-amber-600 dark:text-amber-500"
                                : ""
                          }
                        >
                          {new Date(`${c.prazo_vigencia}T00:00:00`).toLocaleDateString("pt-BR")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
