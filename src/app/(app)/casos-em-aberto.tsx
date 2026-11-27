"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BadgePrioridade } from "@/components/badge-prioridade";
import { Badge } from "@/components/ui/badge";
import { gruposPorGrau, hrefVerTodos, lerModoEmAberto, MODO_EM_ABERTO_PADRAO, type CasoEmAberto, type ModoEmAberto } from "@/lib/dashboard/em-aberto";
import { STATUS_LABELS } from "@/lib/labels";
import { STATUS_BADGE_CLASSES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

const CHAVE_MODO = "aura:inicio:em-aberto";

function lerModo(): ModoEmAberto | undefined {
  try {
    return lerModoEmAberto(window.localStorage.getItem(CHAVE_MODO));
  } catch {
    return undefined;
  }
}

function salvarModo(v: ModoEmAberto) {
  try {
    window.localStorage.setItem(CHAVE_MODO, v);
  } catch {
    // Sem armazenamento (aba anônima, bloqueado): só não lembra.
  }
}

/** Caso + "N dias" na etapa (calculado no servidor, para não divergir na hidratação). */
export type CasoEmAbertoTela = CasoEmAberto & { naEtapa: string };

function Linha({ caso }: { caso: CasoEmAbertoTela }) {
  return (
    <li className="border-b last:border-0">
      <Link
        href={`/casos/${caso.id}`}
        className="hover:bg-accent/50 grid grid-cols-[4.5rem_1fr_auto] items-start gap-2 py-1.5 text-sm"
        data-testid="em-aberto-caso"
        data-protocolo={caso.protocolo}
      >
        <span className="font-medium">#{caso.protocolo}</span>
        <span className="min-w-0">
          <span className="block truncate">{caso.clienteNome}</span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
            <BadgePrioridade grau={caso.prioridade} className="px-1.5 py-0 text-[10px]" />
            <Badge className={cn("px-1.5 py-0 text-[10px]", STATUS_BADGE_CLASSES[caso.statusAtual])}>{STATUS_LABELS[caso.statusAtual]}</Badge>
            {caso.filial}
          </span>
        </span>
        <span className="text-right text-xs whitespace-nowrap">{caso.naEtapa}</span>
      </Link>
    </li>
  );
}

/**
 * Card "Casos em aberto": chave "Por grau | Por tempo parado" (lembrada no
 * navegador). Por grau: Urgente → Sem grau com subtítulo "Grau · N", o mais
 * parado primeiro dentro do grau. Por tempo parado: do mais parado ao menos.
 */
export function CasosEmAberto({ grau, parado }: { grau: CasoEmAbertoTela[]; parado: CasoEmAbertoTela[] }) {
  const [modo, setModo] = useState<ModoEmAberto>(MODO_EM_ABERTO_PADRAO);
  useEffect(() => {
    const salvo = lerModo();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência local, lida só no navegador
    if (salvo) setModo(salvo);
  }, []);

  const escolher = (v: ModoEmAberto) => {
    setModo(v);
    salvarModo(v);
  };

  const vazio = grau.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="casos-em-aberto" data-modo={modo}>
      <div className="absolute top-4 right-4 flex rounded-md border p-0.5 text-xs" role="group" aria-label="Ordenar casos em aberto" data-testid="chave-em-aberto">
        {(["grau", "parado"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={modo === v}
            onClick={() => escolher(v)}
            className={cn("rounded px-2 py-1", modo === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "grau" ? "Por grau" : "Por tempo parado"}
          </button>
        ))}
      </div>

      {vazio ? (
        <p className="text-muted-foreground text-sm">Nenhum caso em aberto.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" data-testid="em-aberto-rolagem">
          <div className="text-muted-foreground bg-card sticky top-0 z-10 grid grid-cols-[4.5rem_1fr_auto] gap-2 border-b pb-1 text-xs font-medium">
            <span>Protocolo</span>
            <span>Cliente</span>
            <span className="text-right">Na etapa</span>
          </div>
          {modo === "grau" ? (
            gruposPorGrau(grau).map((g) => (
              <section key={g.chave} aria-label={g.rotulo} data-testid="grupo-grau" data-grau={g.chave}>
                <h3 className="text-muted-foreground pt-2 text-[11px] font-semibold tracking-wide uppercase">{g.rotulo}</h3>
                <ul>
                  {g.casos.map((c) => (
                    <Linha key={c.id} caso={c} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul>
              {parado.map((c) => (
                <Linha key={c.id} caso={c} />
              ))}
            </ul>
          )}
        </div>
      )}
      <Link href={hrefVerTodos(modo)} className="text-primary mt-auto flex items-center gap-1 self-end text-sm hover:underline" data-testid="ver-todos-em-aberto">
        Ver todos <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
