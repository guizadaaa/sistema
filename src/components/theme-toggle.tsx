"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

export const TEMA_STORAGE_KEY = "tema";

function aplicarTema(tema: "light" | "dark") {
  document.documentElement.classList.toggle("dark", tema === "dark");
  localStorage.setItem(TEMA_STORAGE_KEY, tema);
  // dispara os listeners do useSyncExternalStore abaixo
  window.dispatchEvent(new Event("tema-alterado"));
}

function subscribe(callback: () => void) {
  window.addEventListener("tema-alterado", callback);
  return () => window.removeEventListener("tema-alterado", callback);
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// No servidor não há classe nenhuma pra ler — o valor real já foi aplicado
// no <html> por um script inline (ver layout.tsx) antes do primeiro paint,
// então essa 1ª leitura do cliente (via useSyncExternalStore) corrige sem
// piscar um tema errado de fato, só o rótulo do botão no primeiríssimo tick.
function getServerSnapshot(): "light" | "dark" {
  return "light";
}

/**
 * Alternância manual entre claro/escuro — cada pessoa da equipe escolhe o
 * que prefere, independente da preferência do sistema operacional.
 */
export function ThemeToggle() {
  const tema = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function alternar() {
    aplicarTema(tema === "dark" ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={alternar}
      aria-label="Alternar tema claro ou escuro"
      className="w-[5.5rem]"
    >
      {tema === "dark" ? (
        <>
          <SunIcon /> Claro
        </>
      ) : (
        <>
          <MoonIcon /> Escuro
        </>
      )}
    </Button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
    </svg>
  );
}
