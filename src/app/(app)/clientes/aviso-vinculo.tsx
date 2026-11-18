"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";

// Aviso escondido pelo "×": vale só nesta sessão do navegador.
const CHAVE_AVISO = "clientes:aviso-vinculo-escondido";
const ouvintes = new Set<() => void>();
function lerAvisoEscondido(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_AVISO) === "1";
  } catch {
    return false;
  }
}
function esconderAviso() {
  try {
    sessionStorage.setItem(CHAVE_AVISO, "1");
  } catch {
    /* sem storage: some só até recarregar */
  }
  ouvintes.forEach((f) => f());
}

export function AvisoVinculo({ quantidade }: { quantidade: number }) {
  const escondido = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerAvisoEscondido,
    () => false
  );
  if (escondido || quantidade === 0) return null;
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm" data-testid="aviso-vinculo">
      <Info className="size-4 shrink-0" />
      <span>
        {quantidade} nome(s) do Systur parecem ser de usuários ativos e não estão vinculados.{" "}
        <Link href="/cliques/vendedores-systur?mostrar=parecem" className="text-foreground underline underline-offset-2">
          Vincular
        </Link>
      </span>
      <button type="button" onClick={esconderAviso} aria-label="Esconder aviso" className="hover:text-foreground ml-1">
        <X className="size-3.5" />
      </button>
    </p>
  );
}
