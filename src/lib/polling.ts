"use client";

import { useEffect, useRef } from "react";

/**
 * Intervalo das consultas periódicas do layout (sino, pop-up de prazos,
 * pop-up de vendas importadas). Cada consulta é uma server action que valida
 * a sessão e lê o Supabase — vira linhas de log (Log Ingestion do plano Free).
 * Nenhum desses avisos exige latência de segundos: prazos são avaliados uma
 * vez por dia e a importação de vendas, poucas vezes por dia.
 */
export const INTERVALO_POLLING_MS = 2 * 60 * 1000;

/**
 * Se deve consultar agora: só com a aba visível e quando a última consulta
 * tem pelo menos `intervaloMs`. Aba em segundo plano não consulta; ao voltar
 * a ficar visível, consulta na hora se a última já passou do intervalo.
 */
export function deveConsultar(visivel: boolean, ultimaMs: number, agoraMs: number, intervaloMs: number): boolean {
  return visivel && agoraMs - ultimaMs >= intervaloMs;
}

/**
 * Executa `consultar` ao montar e depois a cada `intervaloMs`, mas só com a
 * aba visível (pausa em segundo plano e retoma ao voltar). `consultar` recebe
 * `cancelado()` para ignorar respostas que chegam depois de desmontar.
 */
export function usePollingVisivel(
  consultar: (cancelado: () => boolean) => void | Promise<void>,
  intervaloMs: number = INTERVALO_POLLING_MS,
  { imediato = true }: { imediato?: boolean } = {}
) {
  const consultarRef = useRef(consultar);
  useEffect(() => {
    consultarRef.current = consultar;
  }, [consultar]);

  useEffect(() => {
    let desmontado = false;
    const cancelado = () => desmontado;
    let ultima = Date.now();

    const executar = () => {
      ultima = Date.now();
      void consultarRef.current(cancelado);
    };
    const visivel = () => document.visibilityState === "visible";

    if (imediato) executar();

    // Folga de 1 s: o timer pode disparar alguns ms antes de completar o intervalo.
    const intervalo = window.setInterval(() => {
      if (deveConsultar(visivel(), ultima, Date.now(), intervaloMs - 1000)) executar();
    }, intervaloMs);

    const aoMudarVisibilidade = () => {
      if (deveConsultar(visivel(), ultima, Date.now(), intervaloMs)) executar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      desmontado = true;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [intervaloMs, imediato]);
}
