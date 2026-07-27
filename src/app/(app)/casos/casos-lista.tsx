import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS, STATUS_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { corPrazoVigencia, descricaoDiasAteVencimento } from "@/lib/casos/prazo";
import { STATUS_ORDEM } from "@/lib/casos/status";
import { PRAZO_COR_TEXT_CLASSES } from "@/lib/prazo-colors";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import type { CasoListado } from "@/lib/casos/listar";
import { TIPOS_CASO } from "@/lib/validation/caso";
import type { FilialCvc, StatusCaso, TipoCaso } from "@/lib/supabase/types";

export const STATUS_OPCOES: readonly StatusCaso[] = STATUS_ORDEM;

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
  ehAdmMaster,
}: {
  casos: CasoListado[];
  filtros: {
    status?: StatusCaso;
    tipo?: TipoCaso;
    filial?: FilialCvc;
    busca?: string;
    dataInicio?: string;
    dataFim?: string;
    mostrarTeste?: boolean;
  };
  mostrarFiltroFilial: boolean;
  ehAdmMaster: boolean;
}) {
  const temFiltroAtivo = Boolean(
    filtros.busca ||
      filtros.status ||
      filtros.tipo ||
      filtros.filial ||
      filtros.dataInicio ||
      filtros.dataFim ||
      filtros.mostrarTeste
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Acompanhar Casos</h1>
        <Button asChild>
          <Link href="/casos/novo">
            <Plus /> Adicionar caso
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <form method="get" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="busca">
                  Buscar
                </label>
                <Input
                  id="busca"
                  name="busca"
                  placeholder="Contrato, cliente, protocolo ou CPF"
                  defaultValue={filtros.busca ?? ""}
                  className="w-72"
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
                <label className="text-sm font-medium">Aberto entre</label>
                <DateRangePicker
                  nomeInicio="dataInicio"
                  nomeFim="dataFim"
                  valorInicialInicio={filtros.dataInicio}
                  valorInicialFim={filtros.dataFim}
                />
              </div>

              {ehAdmMaster && (
                <div className="flex items-center gap-2">
                  <Checkbox id="mostrarTeste" name="mostrarTeste" value="1" defaultChecked={filtros.mostrarTeste} />
                  <Label htmlFor="mostrarTeste" className="text-sm font-normal">
                    Mostrar casos de teste
                  </Label>
                </div>
              )}

              <Button type="submit" variant="outline">
                Filtrar
              </Button>

              {temFiltroAtivo && (
                <Button asChild variant="ghost">
                  <Link href="/casos">
                    <Trash2 /> Limpar filtros
                  </Link>
                </Button>
              )}
            </div>
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
                  const cor = corPrazoVigencia(c.prazo_vigencia);
                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                            #{c.protocolo}
                          </Link>
                          {c.caso_teste && <Badge variant="outline">Teste</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{TIPO_CASO_LABELS[c.tipo_caso]}</td>
                      <td className="py-2 pr-4">{c.cliente_nome}</td>
                      <td className="py-2 pr-4">{c.donoNome}</td>
                      <td className="py-2 pr-4">
                        <Badge className={STATUS_BADGE_CLASSES[c.status_atual]}>{STATUS_LABELS[c.status_atual]}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <div className={cn("flex flex-col", PRAZO_COR_TEXT_CLASSES[cor])}>
                          <span className="font-medium">
                            {new Date(`${c.prazo_vigencia}T00:00:00`).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="text-xs">{descricaoDiasAteVencimento(c.prazo_vigencia)}</span>
                        </div>
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
