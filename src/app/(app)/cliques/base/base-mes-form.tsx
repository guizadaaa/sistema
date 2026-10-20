"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FILIAL_LABELS } from "@/lib/labels";
import type { LinkParaBase, ResultadoConsultaLinkly } from "@/lib/linkly/base-mes";
import { calcularPreviaBase } from "@/lib/linkly/contagem-linkly";
import { dataHoraSaoPaulo, rotuloMes } from "@/lib/linkly/mes";

import { consultarLinklyAction, gravarBasesAction, type ResultadoGravacao } from "./actions";

const ROTULO_SITUACAO: Record<LinkParaBase["situacao"], string> = {
  sem_base: "Sem base (contagem parcial)",
  base_manual: "Base definida",
  snapshot_real: "Base medida (snapshot real) — não precisa",
  sem_total: "Sem total sincronizado",
};

function dia1(mes: string): string {
  const [ano, m] = mes.split("-");
  return `01/${m}/${ano}`;
}

export function BaseMesForm({ mes, links }: { mes: string; links: LinkParaBase[] }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [fonte, setFonte] = useState<Record<string, "linkly" | "manual">>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [consulta, setConsulta] = useState<ResultadoConsultaLinkly | undefined>();
  const [erroConsulta, setErroConsulta] = useState<string | undefined>();
  const [confirmando, setConfirmando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoGravacao[] | undefined>();
  const [erroGravacao, setErroGravacao] = useState<string | undefined>();
  const [consultando, startConsulta] = useTransition();
  const [gravando, startGravacao] = useTransition();

  const editaveis = links.filter((l) => l.situacao === "sem_base" || l.situacao === "base_manual");

  const previas = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof calcularPreviaBase>>();
    for (const link of editaveis) {
      const bruto = valores[link.linkId];
      mapa.set(link.linkId, calcularPreviaBase(link.totalAtual, bruto === undefined || bruto === "" ? null : Number(bruto)));
    }
    return mapa;
  }, [editaveis, valores]);

  const itensParaGravar = editaveis.filter((l) => selecionados.has(l.linkId) && previas.get(l.linkId)?.ok);

  const definirValor = (linkId: string, valor: string, origem: "linkly" | "manual") => {
    setValores((v) => ({ ...v, [linkId]: valor }));
    setFonte((f) => ({ ...f, [linkId]: origem }));
    setSelecionados((s) => new Set(s).add(linkId));
  };

  const consultar = () => {
    setErroConsulta(undefined);
    startConsulta(async () => {
      const resposta = await consultarLinklyAction();
      if (resposta.error || !resposta.resultado) {
        setErroConsulta(resposta.error ?? "Falha ao consultar o Linkly.");
        return;
      }
      setConsulta(resposta.resultado);
      for (const link of editaveis) {
        const cliques = resposta.resultado.cliquesPorLink[link.linkId];
        if (cliques !== undefined) definirValor(link.linkId, String(cliques), "linkly");
      }
    });
  };

  const gravar = () => {
    setErroGravacao(undefined);
    startGravacao(async () => {
      const resposta = await gravarBasesAction(
        itensParaGravar.map((l) => ({ linkId: l.linkId, cliquesNoMes: Number(valores[l.linkId]) }))
      );
      setConfirmando(false);
      if (resposta.error) setErroGravacao(resposta.error);
      else setResultados(resposta.resultados);
    });
  };

  const resultadoPorLink = new Map((resultados ?? []).map((r) => [r.linkId, r]));
  const nomeLink = new Map(links.map((l) => [l.linkId, l.shortUrl]));
  // A consulta cobre todos os links; com ?loja= só os da loja exibida importam.
  const naoEncontrados = consulta?.naoEncontrados.filter((id) => nomeLink.has(id)) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="first-letter:uppercase">Definir base de {rotuloMes(mes)}</CardTitle>
          <CardDescription>
            Para o mês contar desde {dia1(mes)} 00:00 (São Paulo) nos links sem registro anterior, informe quantos
            cliques cada link teve desde então. A base gravada é <strong>total atual − cliques do mês</strong>, datada do
            último dia do mês anterior. Nada é gravado antes de você confirmar a prévia.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              A contagem do Linkly pode estar defasada em até 3 horas em relação ao total atual (cache dos relatórios). Se
              o número vier menor que o real, o mês fica com alguns cliques a menos — nunca a mais.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={consultar} disabled={consultando}>
              {consultando ? "Consultando o Linkly..." : `Buscar no Linkly (cliques desde ${dia1(mes)})`}
            </Button>
            <span className="text-muted-foreground text-xs">
              Uma consulta por workspace (limite do Linkly: 50 por hora). Ou digite os números do relatório do Linkly nos
              campos abaixo.
            </span>
          </div>
          {erroConsulta && <p className="text-destructive text-sm">{erroConsulta}</p>}

          {consulta && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground text-xs">Consulta feita em {dataHoraSaoPaulo(consulta.consultadoEm)}.</p>
              {consulta.workspaces
                .filter((w) => !w.ok)
                .map((w) => (
                  <div key={w.workspaceSecret} className="border-destructive/40 rounded-md border p-3">
                    <p className="text-destructive font-medium">
                      {w.workspaceSecret}: {w.erro}
                    </p>
                    {w.trechoBruto && (
                      <>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Trecho da resposta (sem a API key) — envie para ajustar o código com base na resposta real:
                        </p>
                        <pre className="bg-muted mt-1 max-h-48 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">{w.trechoBruto}</pre>
                      </>
                    )}
                  </div>
                ))}
              {naoEncontrados.length > 0 && (
                <p className="text-destructive text-xs">
                  Não encontrados na lista de links do Linkly: {naoEncontrados.map((id) => nomeLink.get(id)).join(", ")}
                  — preencha esses manualmente.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prévia</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-2 font-medium"></th>
                <th className="py-2 pr-4 font-medium">Link</th>
                <th className="py-2 pr-4 font-medium">Situação</th>
                <th className="py-2 pr-4 font-medium">Total atual</th>
                <th className="py-2 pr-4 font-medium">Cliques desde {dia1(mes).slice(0, 5)}</th>
                <th className="py-2 pr-4 font-medium">Base resultante</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const editavel = link.situacao === "sem_base" || link.situacao === "base_manual";
                const previa = previas.get(link.linkId);
                const gravado = resultadoPorLink.get(link.linkId);
                return (
                  <tr key={link.linkId} className="border-b align-top last:border-0">
                    <td className="py-2 pr-2">
                      <Checkbox
                        aria-label={`Incluir ${link.shortUrl}`}
                        disabled={!editavel || !previa?.ok}
                        checked={selecionados.has(link.linkId) && Boolean(previa?.ok)}
                        onCheckedChange={(marcado) =>
                          setSelecionados((s) => {
                            const novo = new Set(s);
                            if (marcado) novo.add(link.linkId);
                            else novo.delete(link.linkId);
                            return novo;
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <span className="block">{link.shortUrl}</span>
                      <span className="text-muted-foreground text-xs">
                        {FILIAL_LABELS[link.filial]} · {link.tipo === "vitrine" ? "vitrine" : "vendedor"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {ROTULO_SITUACAO[link.situacao]}
                      {link.situacao === "base_manual" && link.baseAtual !== null && (
                        <span className="text-muted-foreground block text-xs">base atual: {link.baseAtual}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {link.totalAtual ?? "—"}
                      {link.totalAtualizadoEm && (
                        <span className="text-muted-foreground block text-xs">{dataHoraSaoPaulo(link.totalAtualizadoEm)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {editavel ? (
                        <>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            className="w-32"
                            aria-label={`Cliques desde o dia 1 em ${link.shortUrl}`}
                            value={valores[link.linkId] ?? ""}
                            onChange={(e) => definirValor(link.linkId, e.target.value, "manual")}
                          />
                          {fonte[link.linkId] && (
                            <span className="text-muted-foreground text-xs">
                              {fonte[link.linkId] === "linkly" ? "do Linkly" : "digitado"}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {editavel && previa ? (
                        previa.ok ? (
                          <span className="font-medium">{previa.base}</span>
                        ) : valores[link.linkId] ? (
                          <span className="text-destructive text-xs">{previa.motivo}</span>
                        ) : (
                          "—"
                        )
                      ) : (
                        "—"
                      )}
                      {gravado && (
                        <span className={gravado.ok ? "block text-xs text-emerald-600" : "text-destructive block text-xs"}>
                          {gravado.ok ? `gravada (${gravado.base})` : gravado.erro}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => setConfirmando(true)} disabled={itensParaGravar.length === 0 || gravando}>
              Revisar e gravar ({itensParaGravar.length})
            </Button>
            {erroGravacao && <p className="text-destructive text-sm">{erroGravacao}</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="first-letter:uppercase">Gravar base de {rotuloMes(mes)}?</DialogTitle>
            <DialogDescription>
              Cada link abaixo passa a contar o mês a partir de {dia1(mes)}. Reaplicar depois substitui a base.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto text-sm">
            {itensParaGravar.map((l) => {
              const previa = previas.get(l.linkId);
              return (
                <li key={l.linkId} className="flex justify-between gap-2">
                  <span>{l.shortUrl}</span>
                  <span className="text-muted-foreground">
                    {l.totalAtual} − {valores[l.linkId]} = <strong>{previa?.ok ? previa.base : "—"}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={gravando}>
              Cancelar
            </Button>
            <Button onClick={gravar} disabled={gravando}>
              {gravando ? "Gravando..." : "Confirmar e gravar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
