"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NotificacaoListada } from "@/lib/notificacoes/listar";

import { buscarVendasImportadasNaoLidas, marcarNotificacaoComoLida } from "./notificacoes/actions";
import { PopupPrazos, type AcoesPopupPrazos } from "./popup-prazos";

// Mesmo intervalo do sino e do pop-up de prazos.
const INTERVALO_POLLING_MS = 30_000;

const impedirFechar = (evento: Event) => evento.preventDefault();

/**
 * Parte apresentacional. Não fecha no X (não há), no Esc nem no clique fora:
 * só "Li e estou ciente" confirma; "Ver vendas" navega sem confirmar.
 */
export function PopupVendasImportadasView({
  aviso,
  onCiente,
  onVerVendas,
}: {
  aviso: NotificacaoListada | null;
  onCiente: (id: string) => void;
  onVerVendas: (id: string) => void;
}) {
  return (
    <Dialog open={aviso !== null}>
      <DialogContent
        className="max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={impedirFechar}
        onPointerDownOutside={impedirFechar}
        onInteractOutside={impedirFechar}
      >
        <DialogHeader>
          <DialogTitle>Vendas atualizadas</DialogTitle>
          <DialogDescription className="text-foreground text-base">{aviso?.mensagem}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => aviso && onVerVendas(aviso.id)}>
            Ver vendas
          </Button>
          <Button type="button" onClick={() => aviso && onCiente(aviso.id)}>
            Li e estou ciente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ACOES_PADRAO = { buscarVendasImportadasNaoLidas, marcarNotificacaoComoLida };

/**
 * Aviso "Vendas da loja X atualizadas até dd/mm." — abre sozinho e só some de
 * vez com "Li e estou ciente" (grava lida_em). "Ver vendas" leva a /vendas e
 * esconde o pop-up só até o próximo carregamento ou ciclo de polling.
 */
export function PopupVendasImportadas({
  pausado = false,
  acoes = ACOES_PADRAO,
  irParaVendas,
}: {
  /** true enquanto o pop-up de prazos está na frente (nunca dois ao mesmo tempo). */
  pausado?: boolean;
  /** Ponto de injeção para teste de navegador; em produção, as server actions. */
  acoes?: typeof ACOES_PADRAO;
  irParaVendas?: () => void;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<NotificacaoListada | null>(null);
  const [adiado, setAdiado] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const atualizar = async () => {
      const lista = await acoes.buscarVendasImportadasNaoLidas();
      if (cancelado) return;
      setAviso(lista[0] ?? null);
      // Novo ciclo: o "Ver vendas" adiou só até aqui.
      setAdiado(false);
    };

    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_POLLING_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [acoes]);

  const ciente = (id: string) => {
    setAviso(null);
    void acoes.marcarNotificacaoComoLida(id);
  };

  const verVendas = () => {
    setAdiado(true);
    if (irParaVendas) irParaVendas();
    else router.push("/vendas");
  };

  return <PopupVendasImportadasView aviso={pausado || adiado ? null : aviso} onCiente={ciente} onVerVendas={verVendas} />;
}

/** Os pop-ups de aviso do app, um de cada vez: prazos primeiro, depois vendas. */
export function PopupsAvisos({
  acoesPrazos,
  acoesVendas,
  irParaVendas,
}: {
  acoesPrazos?: AcoesPopupPrazos;
  acoesVendas?: typeof ACOES_PADRAO;
  irParaVendas?: () => void;
} = {}) {
  const [prazosOcupado, setPrazosOcupado] = useState(true);

  return (
    <>
      <PopupPrazos onOcupadoChange={setPrazosOcupado} acoes={acoesPrazos} />
      <PopupVendasImportadas pausado={prazosOcupado} acoes={acoesVendas} irParaVendas={irParaVendas} />
    </>
  );
}
