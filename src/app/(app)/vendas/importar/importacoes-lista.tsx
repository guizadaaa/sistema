import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FILIAL_LABELS } from "@/lib/labels";
import type { StatusAvisoImportacao } from "@/lib/supabase/types";
import type { ImportacaoVendas } from "@/lib/vendas/importacoes";

const FUSO = "America/Sao_Paulo";

function dataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function diaMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

const STATUS_ROTULO: Record<StatusAvisoImportacao, string> = {
  confirmado: "confirmou",
  pendente: "pendente",
  substituido: "substituído",
};

/** Últimas importações por loja e quem já confirmou o aviso ("Li e estou ciente"). */
export function ImportacoesLista({ importacoes }: { importacoes: ImportacaoVendas[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas importações</CardTitle>
      </CardHeader>
      <CardContent>
        {importacoes.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma importação registrada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="importacoes-lista">
            {importacoes.map((imp) => {
              const confirmaram = imp.destinatarios.filter((d) => d.status === "confirmado").length;
              return (
                <li key={imp.id} className="rounded-md border text-sm" data-testid="importacao">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-2">
                      <span className="font-medium">{FILIAL_LABELS[imp.filial]}</span>
                      <span>{dataHora(imp.importado_em)}</span>
                      <span className="text-muted-foreground">por {imp.importado_por_nome}</span>
                      <span>até {diaMes(imp.ate)}</span>
                      <Badge variant={confirmaram === imp.destinatarios.length ? "default" : "outline"} data-testid="contagem">
                        {confirmaram} de {imp.destinatarios.length} confirmaram
                      </Badge>
                    </summary>
                    <ul className="flex flex-col gap-1 border-t p-2">
                      {imp.destinatarios.length === 0 && <li className="text-muted-foreground">Ninguém da loja foi avisado.</li>}
                      {imp.destinatarios.map((d, i) => (
                        <li key={`${d.nome}-${i}`} className="flex justify-between gap-2" data-testid="destinatario">
                          <span>{d.nome}</span>
                          <span className={d.status === "confirmado" ? "" : "text-muted-foreground"}>
                            {d.status === "confirmado" && d.confirmado_em
                              ? `confirmou em ${dataHora(d.confirmado_em)}`
                              : STATUS_ROTULO[d.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
