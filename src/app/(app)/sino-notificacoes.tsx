"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIPO_NOTIFICACAO_LABELS } from "@/lib/labels";
import type { NotificacaoListada } from "@/lib/notificacoes/listar";

import { buscarSinoNotificacoes, marcarNotificacaoComoLida, marcarTodasNotificacoesComoLidas } from "./notificacoes/actions";

// Nenhum dos 3 gatilhos (prazo a N dias, caso novo, delegação expirando)
// exige latência de segundos — dois são avaliados uma vez por dia, o
// terceiro no momento da criação do caso — então polling simples resolve
// sem o custo de manter uma conexão Realtime viva (reconexão, expiração de
// token). Ver comentário da migration 20260723000003_notificacoes.sql.
const INTERVALO_POLLING_MS = 30_000;

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export function SinoNotificacoes({
  naoLidasInicial,
  recentesIniciais,
}: {
  naoLidasInicial: number;
  recentesIniciais: NotificacaoListada[];
}) {
  const [naoLidas, setNaoLidas] = useState(naoLidasInicial);
  const [recentes, setRecentes] = useState(recentesIniciais);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const atualizar = async () => {
      const estado = await buscarSinoNotificacoes();
      setNaoLidas(estado.naoLidas);
      setRecentes(estado.recentes);
    };

    const intervalo = setInterval(atualizar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, []);

  const marcarUmaComoLida = async (id: string) => {
    setRecentes((prev) => prev.map((n) => (n.id === id ? { ...n, lida_em: new Date().toISOString() } : n)));
    setNaoLidas((prev) => Math.max(0, prev - 1));
    await marcarNotificacaoComoLida(id);
  };

  const marcarTodasComoLidas = async () => {
    setRecentes((prev) => prev.map((n) => (n.lida_em ? n : { ...n, lida_em: new Date().toISOString() })));
    setNaoLidas(0);
    await marcarTodasNotificacoesComoLidas();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : "Notificações"}
        className="relative"
      >
        <BellIcon />
        {naoLidas > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notificações</DialogTitle>
          </DialogHeader>

          {recentes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma notificação ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {naoLidas > 0 && (
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={marcarTodasComoLidas}>
                  Marcar todas como lidas
                </Button>
              )}
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {recentes.map((n) => (
                  <li
                    key={n.id}
                    className={`rounded-md border p-2 text-sm ${n.lida_em ? "text-muted-foreground" : "font-medium"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs tracking-wide uppercase">
                          {TIPO_NOTIFICACAO_LABELS[n.tipo]}
                        </span>
                        {n.caso_id ? (
                          <Link href={`/casos/${n.caso_id}`} className="hover:underline" onClick={() => setAberto(false)}>
                            {n.mensagem}
                          </Link>
                        ) : (
                          <span>{n.mensagem}</span>
                        )}
                        <span className="text-muted-foreground text-xs">{formatarDataHora(n.criado_em)}</span>
                      </div>
                      {!n.lida_em && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => marcarUmaComoLida(n.id)}>
                          Marcar lida
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
