"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function paraDataLocal(iso?: string): Date | undefined {
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

function paraIso(data?: Date): string {
  return data ? format(data, "yyyy-MM-dd") : "";
}

/**
 * Um único campo de intervalo de data (abre um calendário de 2 meses,
 * seleciona início e fim numa tacada só) em vez de dois inputs de data
 * separados. Não tem estado próprio de formulário — grava o intervalo em
 * dois inputs hidden (mesmos nomes que os inputs de data separados usavam
 * antes), então o <form method="get"> ao redor continua submetendo do
 * jeito que já submetia, sem precisar de onSubmit nem de JS no servidor.
 */
export function DateRangePicker({
  nomeInicio,
  nomeFim,
  valorInicialInicio,
  valorInicialFim,
  className,
}: {
  nomeInicio: string;
  nomeFim: string;
  valorInicialInicio?: string;
  valorInicialFim?: string;
  className?: string;
}) {
  const [range, setRange] = useState<DateRange | undefined>(
    valorInicialInicio ? { from: paraDataLocal(valorInicialInicio), to: paraDataLocal(valorInicialFim) } : undefined
  );

  const rotulo = range?.from
    ? range.to
      ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}`
      : format(range.from, "dd/MM/yyyy")
    : "Período (aberto de / até)";

  return (
    <>
      <input type="hidden" name={nomeInicio} value={paraIso(range?.from)} readOnly />
      <input type="hidden" name={nomeFim} value={paraIso(range?.to)} readOnly />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("justify-start font-normal", !range?.from && "text-muted-foreground", className)}
          >
            <CalendarIcon />
            {rotulo}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            onSelect={setRange}
            defaultMonth={range?.from}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
