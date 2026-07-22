import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DetalheCaso } from "@/lib/casos/detalhe";
import {
  FILIAL_LABELS,
  MOTIVO_LABELS,
  QUEM_PAGA_LABELS,
  STATUS_LABELS,
  SUBTIPO_REEMBOLSO_LABELS,
  SUBTIPO_REMARCACAO_LABELS,
  TIPO_CASO_LABELS,
  TIPO_DESFECHO_LABELS,
} from "@/lib/labels";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";

import { AnexosSecao } from "./anexos-secao";
import { ContratosAdicionaisSecao } from "./contratos-adicionais-secao";
import { DesfechoForm } from "./desfecho-form";
import { ImplicacaoForm } from "./implicacao-form";
import { StatusAcoes } from "./status-acoes";
import { Timeline } from "./timeline";

function formatarData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CasoDetalhe({
  detalhe,
  podeConduzirFluxo,
  ehAdmin,
}: {
  detalhe: DetalheCaso;
  podeConduzirFluxo: boolean;
  ehAdmin: boolean;
}) {
  const { caso, donoNome, criadoPorNome, historico, anexos, contratosAdicionais, desfechos, implicacao } = detalhe;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Protocolo #{caso.protocolo}</h1>
        <Badge className={STATUS_BADGE_CLASSES[caso.status_atual]}>{STATUS_LABELS[caso.status_atual]}</Badge>
        {caso.elegivel_ouvidoria && <Badge variant="outline">Elegível a Ouvidoria</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados do caso</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd>{TIPO_CASO_LABELS[caso.tipo_caso]}</dd>

              <dt className="text-muted-foreground">Filial</dt>
              <dd>{FILIAL_LABELS[caso.filial]}</dd>

              <dt className="text-muted-foreground">Dono do caso</dt>
              <dd>{donoNome}</dd>

              <dt className="text-muted-foreground">Registrado por</dt>
              <dd>{criadoPorNome}</dd>

              <dt className="text-muted-foreground">Contrato</dt>
              <dd>{caso.contrato_numero}</dd>

              <dt className="text-muted-foreground">Cliente</dt>
              <dd>{caso.cliente_nome}</dd>

              <dt className="text-muted-foreground">CPF</dt>
              <dd>{caso.cliente_cpf}</dd>

              <dt className="text-muted-foreground">Prazo de vigência</dt>
              <dd>{formatarData(caso.prazo_vigencia)}</dd>

              {caso.motivo && (
                <>
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd>{MOTIVO_LABELS[caso.motivo]}</dd>
                </>
              )}

              {caso.parcelas_em_aberto !== null && (
                <>
                  <dt className="text-muted-foreground">Parcelas em aberto</dt>
                  <dd>{caso.parcelas_em_aberto}</dd>
                </>
              )}

              {caso.data_cancelamento && (
                <>
                  <dt className="text-muted-foreground">Data de cancelamento</dt>
                  <dd>{formatarData(caso.data_cancelamento)}</dd>
                </>
              )}
            </dl>

            {caso.descricao && (
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-muted-foreground text-sm">Descrição</span>
                <p className="text-sm">{caso.descricao}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Timeline historico={historico} />
            <StatusAcoes
              casoId={caso.id}
              statusAtual={caso.status_atual}
              elegivelOuvidoria={caso.elegivel_ouvidoria}
              podeConduzirFluxo={podeConduzirFluxo}
              ehAdmin={ehAdmin}
            />
          </CardContent>
        </Card>
      </div>

      <ContratosAdicionaisSecao casoId={caso.id} contratos={contratosAdicionais} />

      <AnexosSecao casoId={caso.id} anexos={anexos} />

      {podeConduzirFluxo && (
        <DesfechoForm casoId={caso.id} tiposAnexosExistentes={anexos.map((a) => a.tipo_documento)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Desfechos</CardTitle>
        </CardHeader>
        <CardContent>
          {desfechos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum desfecho registrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {desfechos.map((d) => (
                <li key={d.id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{TIPO_DESFECHO_LABELS[d.tipo]}</div>
                  {d.tipo === "reembolso" && d.subtipo_reembolso && (
                    <div className="text-muted-foreground">
                      {SUBTIPO_REEMBOLSO_LABELS[d.subtipo_reembolso]}
                      {d.valor !== null && ` · ${formatarMoeda(d.valor)}`}
                      {d.banco_nome_completo && ` · ${d.banco_nome_completo}`}
                    </div>
                  )}
                  {d.tipo === "remarcacao" && d.subtipo_remarcacao && (
                    <div className="text-muted-foreground">
                      {SUBTIPO_REMARCACAO_LABELS[d.subtipo_remarcacao]}
                      {d.origem_remarcacao_com_custo && (
                        <> · Motivo: {d.origem_remarcacao_com_custo === "saude" ? "Saúde" : "Outro"}</>
                      )}
                      {d.valor_taxas !== null && ` · Taxas: ${formatarMoeda(d.valor_taxas)}`}
                      {d.valor_diferenca_tarifaria !== null &&
                        ` · Diferença: ${formatarMoeda(d.valor_diferenca_tarifaria)}`}
                    </div>
                  )}
                  {d.tipo === "carta_credito" && d.valor !== null && (
                    <div className="text-muted-foreground">{formatarMoeda(d.valor)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Implicações financeiras</CardTitle>
        </CardHeader>
        <CardContent>
          {implicacao ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Multa contratual</dt>
              <dd>{formatarMoeda(implicacao.multa_contratual_valor)}</dd>

              <dt className="text-muted-foreground">Multa do fornecedor</dt>
              <dd>{formatarMoeda(implicacao.multa_fornecedor_valor)}</dd>

              <dt className="text-muted-foreground">Quem paga</dt>
              <dd>{QUEM_PAGA_LABELS[implicacao.quem_paga]}</dd>

              {implicacao.quem_paga === "vendedor" && implicacao.reducao_markup && (
                <>
                  <dt className="text-muted-foreground">Redução de markup</dt>
                  <dd>Sim</dd>
                </>
              )}

              {implicacao.quem_paga === "vendedor" && implicacao.reducao_comissao && (
                <>
                  <dt className="text-muted-foreground">Redução de comissão</dt>
                  <dd>{formatarMoeda(implicacao.reducao_comissao_valor ?? 0)}</dd>
                </>
              )}

              {implicacao.quem_paga === "vendedor" && implicacao.utilizacao_cortesia && (
                <>
                  <dt className="text-muted-foreground">Cortesia utilizada</dt>
                  <dd>{formatarMoeda(implicacao.utilizacao_cortesia_valor ?? 0)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhuma implicação financeira registrada ainda.</p>
          )}
        </CardContent>
      </Card>

      {podeConduzirFluxo && <ImplicacaoForm casoId={caso.id} implicacaoExistente={implicacao} />}
    </div>
  );
}
