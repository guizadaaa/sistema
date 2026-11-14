import { Database } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataBr } from "@/lib/clientes/base-util";
import type { JanelaColeta } from "@/lib/clientes/base";
import { FILIAL_LABELS } from "@/lib/labels";
import { FILIAIS } from "@/lib/validation/caso";

function dataHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** adm_master: até onde o bot já coletou a base, por loja. */
export function CoberturaBase({ janelas }: { janelas: JanelaColeta[] }) {
  return (
    <Card data-testid="cobertura">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4" /> Cobertura da base
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {FILIAIS.map((loja) => {
          const daLoja = janelas.filter((j) => j.loja === loja).sort((a, b) => a.de.localeCompare(b.de));
          const ate = daLoja.reduce<string | null>((max, j) => (!max || j.ate > max ? j.ate : max), null);
          return (
            <div key={loja} className="rounded-md border p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{FILIAL_LABELS[loja]}</span>
                <span className="text-muted-foreground text-xs">{ate ? `coletada até ${dataBr(ate)}` : "nada coletado"}</span>
              </div>
              {daLoja.length > 0 && (
                <table className="mt-2 w-full text-xs">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="font-medium">Janela</th>
                      <th className="text-right font-medium">Reservas</th>
                      <th className="text-right font-medium">Coletada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daLoja.map((j) => (
                      <tr key={j.id}>
                        <td>
                          {dataBr(j.de)} – {dataBr(j.ate)}
                        </td>
                        <td className="text-right">{j.reservas.toLocaleString("pt-BR")}</td>
                        <td className="text-right">{dataHora(j.coletado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
