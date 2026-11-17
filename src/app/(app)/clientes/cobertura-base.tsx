"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Database } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { dataBr } from "@/lib/clientes/base-util";
import type { CoberturaMes, DadosCobertura, JanelaColeta } from "@/lib/clientes/base";
import { FILIAL_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { FILIAIS } from "@/lib/validation/caso";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2019-08-01" -> "ago/2019". */
export function mesAno(iso: string): string {
  const [a, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${a}`;
}

function dataHoraCurta(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(",", "");
}

/** Nível de cor (0 = coberto sem reservas; 1–4 = cada vez mais reservas), relativo ao mês mais cheio da loja. */
export function nivelCor(reservas: number, maximo: number): number {
  if (reservas <= 0 || maximo <= 0) return 0;
  const r = reservas / maximo;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

const CORES = [
  "bg-emerald-100 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900",
  "bg-emerald-200 border-emerald-300 dark:bg-emerald-900 dark:border-emerald-800",
  "bg-emerald-400 border-emerald-500 dark:bg-emerald-700 dark:border-emerald-600",
  "bg-emerald-600 border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400",
  "bg-emerald-800 border-emerald-900 dark:bg-emerald-300 dark:border-emerald-200",
];

function MesesLoja({ meses }: { meses: CoberturaMes[] }) {
  if (meses.length === 0) return null;
  const porMes = new Map(meses.map((m) => [m.mes.slice(0, 7), m]));
  const maximo = Math.max(0, ...meses.map((m) => m.reservas));
  const anos: number[] = [];
  for (let a = Number(meses[0].mes.slice(0, 4)); a <= Number(meses[meses.length - 1].mes.slice(0, 4)); a++) anos.push(a);

  return (
    <div className="flex flex-col gap-1" data-testid="faixas">
      <div className="text-muted-foreground ml-10 grid grid-cols-12 gap-0.5 text-[10px]">
        {MESES.map((m) => (
          <span key={m} className="text-center">
            {m[0].toUpperCase()}
          </span>
        ))}
      </div>
      {anos.map((ano) => (
        <div key={ano} className="flex items-center gap-1">
          <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{ano}</span>
          <div className="grid flex-1 grid-cols-12 gap-0.5">
            {MESES.map((_, i) => {
              const chave = `${ano}-${String(i + 1).padStart(2, "0")}`;
              const m = porMes.get(chave);
              const rotulo = mesAno(`${chave}-01`);
              if (!m) return <span key={chave} className="aspect-square" aria-hidden />;
              const titulo = m.coberto
                ? `${rotulo} · ${m.reservas.toLocaleString("pt-BR")} reservas`
                : `${rotulo} · não coletado${m.reservas ? ` (${m.reservas} reservas de janelas vizinhas)` : ""}`;
              return (
                <span
                  key={chave}
                  title={titulo}
                  aria-label={titulo}
                  data-coberto={m.coberto ? "1" : "0"}
                  className={cn(
                    "aspect-square rounded-[3px] border",
                    m.coberto ? CORES[nivelCor(m.reservas, maximo)] : "border-muted-foreground/40 border-dashed bg-transparent"
                  )}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function JanelasLoja({ janelas }: { janelas: JanelaColeta[] }) {
  if (janelas.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Ver janelas ({janelas.length})</summary>
      <table className="mt-1 w-full">
        <thead className="text-muted-foreground text-left">
          <tr>
            <th className="font-medium">Saída</th>
            <th className="text-right font-medium">Reservas</th>
            <th className="text-right font-medium">Coletada em</th>
          </tr>
        </thead>
        <tbody>
          {[...janelas]
            .sort((a, b) => a.de.localeCompare(b.de))
            .map((j) => (
              <tr key={j.id}>
                <td>
                  de {dataBr(j.de)} a {dataBr(j.ate)}
                </td>
                <td className="text-right tabular-nums">{j.reservas.toLocaleString("pt-BR")}</td>
                <td className="text-right">{dataHoraCurta(j.coletado_em)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </details>
  );
}

export type CarregarCobertura = () => Promise<{ dados?: DadosCobertura; error?: string }>;

function ConteudoCobertura({ janelas, meses, resumo }: DadosCobertura) {
  return (
    <CardContent className="flex flex-col gap-3 pb-4">
      <div className="grid gap-4 md:grid-cols-3">
        {FILIAIS.map((loja) => {
          const r = resumo.find((x) => x.loja === loja);
          return (
            <div key={loja} className="flex flex-col gap-2 rounded-md border p-3" data-testid={`loja-${loja}`}>
              <div className="text-sm font-medium">{FILIAL_LABELS[loja]}</div>
              <p className="text-muted-foreground text-xs" data-testid="resumo-loja">
                {r
                  ? `saídas de ${mesAno(r.saida_de)} a ${mesAno(r.saida_ate)} · ${r.reservas.toLocaleString("pt-BR")} reservas · última coleta ${dataHoraCurta(r.ultima_coleta)}`
                  : "nada coletado"}
              </p>
              <MesesLoja meses={meses.filter((m) => m.loja === loja)} />
              <JanelasLoja janelas={janelas.filter((j) => j.loja === loja)} />
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span className="border-muted-foreground/40 inline-block size-3 rounded-[3px] border border-dashed" /> não coletado
        <span className="ml-2">menos</span>
        {CORES.map((c) => (
          <span key={c} className={cn("inline-block size-3 rounded-[3px] border", c)} />
        ))}
        <span>mais reservas</span>
      </div>
    </CardContent>
  );
}

/**
 * adm_master: até onde o bot já coletou a base (por data de saída). Recolhido
 * por padrão e sem consulta nenhuma: os dados só são buscados ao expandir.
 */
export function CoberturaBase({ carregar, dadosIniciais }: { carregar: CarregarCobertura; dadosIniciais?: DadosCobertura }) {
  const [aberto, setAberto] = useState(Boolean(dadosIniciais));
  const [dados, setDados] = useState<DadosCobertura | undefined>(dadosIniciais);
  const [erro, setErro] = useState<string | undefined>();
  const [carregando, startTransition] = useTransition();

  const buscar = () => {
    setErro(undefined);
    startTransition(async () => {
      try {
        const r = await carregar();
        if (r.error || !r.dados) setErro(r.error ?? "Não foi possível carregar esta parte — tente de novo.");
        else setDados(r.dados);
      } catch {
        setErro("Não foi possível carregar esta parte — tente de novo.");
      }
    });
  };

  return (
    <Card className="gap-0 py-0" data-testid="cobertura">
      <button
        type="button"
        onClick={() => {
          const abrir = !aberto;
          setAberto(abrir);
          if (abrir && !dados && !carregando) buscar();
        }}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-6 py-4 text-left text-sm font-medium"
      >
        {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Database className="size-4" /> Cobertura da base
        <span className="text-muted-foreground font-normal">· por data de saída</span>
      </button>
      {aberto && carregando && <p className="text-muted-foreground px-6 pb-4 text-sm">Carregando cobertura...</p>}
      {aberto && erro && (
        <p className="text-muted-foreground flex items-center gap-2 px-6 pb-4 text-sm" role="alert">
          {erro}
          <button type="button" onClick={buscar} className="text-foreground underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      )}
      {aberto && dados && !carregando && <ConteudoCobertura {...dados} />}
    </Card>
  );
}
