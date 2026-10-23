import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import type { Database, FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

import { TransferirLojaForm } from "./transferir-loja-form";

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export type FichaAlvo = {
  id: string;
  nome_completo: string;
  email: string;
  perfil: PerfilUsuario;
  filial: FilialCvc | null;
  ativo: boolean;
};
export type FichaHistorico = Database["public"]["Functions"]["usuario_transferencias_historico"]["Returns"];

export function FichaUsuario({
  alvo,
  historico,
  podeTransferir,
}: {
  alvo: FichaAlvo;
  historico: FichaHistorico;
  podeTransferir: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/usuarios">← Usuários</Link>
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {alvo.nome_completo}
            <Badge variant={alvo.ativo ? "secondary" : "outline"}>{alvo.ativo ? "Ativo" : "Inativo"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd>{alvo.email}</dd>
            <dt className="text-muted-foreground">Perfil</dt>
            <dd>{PERFIL_LABELS[alvo.perfil]}</dd>
            <dt className="text-muted-foreground">Loja</dt>
            <dd>{alvo.filial ? FILIAL_LABELS[alvo.filial] : "Todas (administração)"}</dd>
          </dl>
        </CardContent>
      </Card>

      {podeTransferir && alvo.filial && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Transferir de loja</CardTitle>
          </CardHeader>
          <CardContent>
            <TransferirLojaForm usuarioId={alvo.id} nome={alvo.nome_completo} lojaAtual={alvo.filial} />
          </CardContent>
        </Card>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Histórico de lojas</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma transferência registrada.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Quando</th>
                  <th className="py-2 pr-4 font-medium">De</th>
                  <th className="py-2 pr-4 font-medium">Para</th>
                  <th className="py-2 pr-4 font-medium">Feito por</th>
                  <th className="py-2 pr-4 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{dataHora.format(new Date(t.feito_em))}</td>
                    <td className="py-2 pr-4">{FILIAL_LABELS[t.loja_de]}</td>
                    <td className="py-2 pr-4">{FILIAL_LABELS[t.loja_para]}</td>
                    <td className="py-2 pr-4">{t.feito_por_nome}</td>
                    <td className="py-2 pr-4">{t.observacao ?? "—"}</td>
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
