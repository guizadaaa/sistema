"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { corPorDias } from "@/lib/casos/prazo";
import { PRAZO_COR_TEXT_CLASSES } from "@/lib/prazo-colors";
import { cn } from "@/lib/utils";
import type { NotificacaoListada } from "@/lib/notificacoes/listar";

import { buscarPrazosNaoLidos, marcarNotificacaoComoLida, marcarTodosPrazosComoLidos } from "./notificacoes/actions";

// Mesmo intervalo do sino (ver sino-notificacoes.tsx) — nenhum dos dois
// gatilhos que alimentam isto (marcos de prazo, avaliados uma vez por dia)
// tem exigência de latência de segundos.
const INTERVALO_POLLING_MS = 30_000;

/** Parte apresentacional, sem busca de dados — testável/visualizável isoladamente. */
export function PopupPrazosView({
  prazos,
  onFecharSemMarcar,
  onMarcarUma,
  onMarcarTodas,
}: {
  prazos: NotificacaoListada[];
  onFecharSemMarcar: () => void;
  onMarcarUma: (id: string) => void;
  onMarcarTodas: () => void;
}) {
  return (
    <Dialog open={prazos.length > 0} onOpenChange={(open) => !open && onFecharSemMarcar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prazos vencendo</DialogTitle>
          <DialogDescription>
            {prazos.length === 1 ? "1 caso precisa de atenção." : `${prazos.length} casos precisam de atenção.`}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {prazos.map((n) => (
            <li key={n.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                {n.caso_id ? (
                  <Link
                    href={`/casos/${n.caso_id}`}
                    className={cn("font-medium hover:underline", PRAZO_COR_TEXT_CLASSES[corPorDias(n.marco_dias ?? 0)])}
                    onClick={() => onMarcarUma(n.id)}
                  >
                    {n.mensagem}
                  </Link>
                ) : (
                  <span className="font-medium">{n.mensagem}</span>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => onMarcarUma(n.id)}>
                  Marcar lida
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <Button type="button" onClick={onMarcarTodas} className="w-fit">
          Marcar todas como lidas e fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pop-up que abre sozinho ao carregar quando há marco de prazo não lido —
 * diferente do sino (exige clique). Fechar sem marcar como lida só some
 * pelo resto desta sessão (o `dispensados` abaixo é local ao componente,
 * refeito do zero a cada novo carregamento) — o sino continua contando
 * normalmente até alguém marcar como lida de verdade.
 */
export function PopupPrazos() {
  const [prazos, setPrazos] = useState<NotificacaoListada[]>([]);
  const [dispensados, setDispensados] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;

    const atualizar = async () => {
      const lista = await buscarPrazosNaoLidos();
      if (!cancelado) setPrazos(lista);
    };

    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_POLLING_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  const visiveis = prazos.filter((p) => !dispensados.has(p.id));

  const dispensarSemMarcar = () => {
    setDispensados((prev) => new Set([...prev, ...visiveis.map((p) => p.id)]));
  };

  const marcarUmaComoLida = (id: string) => {
    setPrazos((prev) => prev.filter((p) => p.id !== id));
    void marcarNotificacaoComoLida(id);
  };

  const marcarTodasComoLidas = () => {
    const ids = new Set(visiveis.map((p) => p.id));
    setPrazos((prev) => prev.filter((p) => !ids.has(p.id)));
    void marcarTodosPrazosComoLidos();
  };

  return (
    <PopupPrazosView
      prazos={visiveis}
      onFecharSemMarcar={dispensarSemMarcar}
      onMarcarUma={marcarUmaComoLida}
      onMarcarTodas={marcarTodasComoLidas}
    />
  );
}
