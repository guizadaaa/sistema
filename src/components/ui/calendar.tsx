"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CalendarDayButton({ className, day: _day, modifiers, ...props }: DayButtonProps) {
  return (
    <button
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "size-8 p-0 font-normal",
        modifiers.today && "border border-input",
        modifiers.selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        (modifiers.range_start || modifiers.range_end) &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md",
        modifiers.range_middle && "bg-accent text-accent-foreground rounded-none",
        className
      )}
      {...props}
    />
  );
}

function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center text-sm font-medium",
        nav: "flex items-center justify-between absolute inset-x-0 top-0",
        button_previous: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0"),
        button_next: cn(buttonVariants({ variant: "outline" }), "size-7 bg-transparent p-0"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground w-8 text-[0.8rem] font-normal",
        week: "flex w-full mt-1",
        day: "size-8 p-0 text-center text-sm",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className="size-4" {...chevronProps} />
          ) : (
            <ChevronRightIcon className="size-4" {...chevronProps} />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

export { Calendar };
