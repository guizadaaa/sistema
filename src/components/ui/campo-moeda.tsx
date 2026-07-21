"use client";

import { useState, type ComponentProps } from "react";

import { mascararMoeda } from "@/lib/validation/moeda";

import { Input } from "./input";

type CampoMoedaProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "defaultValue" | "onChange"> & {
  defaultValue?: number | null;
};

/**
 * Input de texto (não number — sem as setinhas de incremento, que não fazem
 * sentido para valor monetário) que formata em R$ x.xxx,xx a cada tecla. O
 * próprio value submetido pelo form já é a string formatada; o parse de
 * volta para número acontece no schema zod (moedaParaNumero), nunca aqui.
 */
export function CampoMoeda({ defaultValue, ...props }: CampoMoedaProps) {
  const [valor, setValor] = useState(() =>
    defaultValue ? mascararMoeda(String(Math.round(defaultValue * 100))) : ""
  );

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={valor}
      onChange={(e) => setValor(mascararMoeda(e.target.value))}
    />
  );
}
