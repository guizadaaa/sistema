import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";

import { PrazoVigencia } from "@/components/prazo-vigencia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS, SUBTIPO_RECADASTRO_LABELS, TIPO_CASO_LABELS } from "@/lib/labels";
import { STATUS_ORDEM } from "@/lib/casos/status";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { urlCasos, type FiltrosTelaCasos } from "@/lib/casos/barra-status";
import type { CasoListado, ContagemStatus } from "@/lib/casos/listar";
import type { CandidatoVendedor } from "@/lib/casos/opcoes-vendedor";
import { TIPOS_CASO } from "@/lib/validation/caso";

import { BarraStatus } from "./barra-status";
import { FiltroFilialVendedor } from "./filtro-filial-vendedor";
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
  contagem,
  candidatosVendedor,
  filialUsuario,
  mostrarFiltroFilial,
  ehAdmMaster,
}: {
  casos: CasoListado[];
  filtros: FiltrosTelaCasos;
  contagem: ContagemStatus;
  candidatosVendedor: CandidatoVendedor[];
  /** Filial do gerente/vendedor (o select de Filial só aparece para admin). */
  filialUsuario?: FilialCvc;
  mostrarFiltroFilial: boolean;
  ehAdmMaster: boolean;
}) {
  const temFiltroAtivo = Boolean(
    filtros.busca ||
      filtros.status ||
      filtros.tipo ||
      filtros.filial ||
      filtros.vendedor ||
      filtros.dataInicio ||
      filtros.dataFim ||
      filtros.mostrarTeste ||
      filtros.prazo
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
          {/* key: navegar pela barra (status/vencidos) remonta o form, e o select Status acompanha a URL. */}
          <form method="get" className="flex flex-col gap-3" key={urlCasos(filtros)}>
            {filtros.prazo && <input type="hidden" name="prazo" value={filtros.prazo} />}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="busca">
                  Buscar
                </label>
                <Input
                  id="busca"
                  name="busca"
                  placeholder="Contrato, recibo, cliente, protocolo ou CPF"
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

              <FiltroFilialVendedor
                candidatos={candidatosVendedor}
                filialInicial={filtros.filial}
                vendedorInicial={filtros.vendedor}
                mostrarFiltroFilial={mostrarFiltroFilial}
                filialFixa={filialUsuario}
                filiais={FILIAL_OPCOES}
              />

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

      <BarraStatus contagem={contagem} filtros={filtros} />

      <Card>
        <CardContent className="overflow-x-auto">
          {casos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {filtros.mostrarTeste ? "Nenhum caso de teste encontrado." : "Nenhum caso encontrado."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Protocolo</th>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 font-medium">Cliente</th>
                  <th className="py-2 pr-4 font-medium">Dono</th>
                  <th className="py-2 pr-4 font-medium">Contrato de origem</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Prazo de vigência</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/casos/${c.id}`} className="font-medium hover:underline">
                          #{c.protocolo}
                        </Link>
                        {c.caso_teste && <Badge variant="outline">Teste</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col">
                        <span>{TIPO_CASO_LABELS[c.tipo_caso]}</span>
                        {c.subtipo_recadastro && (
                          <span className="text-muted-foreground text-xs">
                            {SUBTIPO_RECADASTRO_LABELS[c.subtipo_recadastro]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{c.cliente_nome}</td>
                    <td className="py-2 pr-4">{c.donoNome}</td>
                    <td className="py-2 pr-4">{c.contrato_origem ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge className={STATUS_BADGE_CLASSES[c.status_atual]}>{STATUS_LABELS[c.status_atual]}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <PrazoVigencia
                        prazoVigencia={c.prazo_vigencia}
                        statusAtual={c.status_atual}
                        resolvidoEm={c.resolvidoEm}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
