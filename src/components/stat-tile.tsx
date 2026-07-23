import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Card de número de destaque — mesmo visual no Dashboard e no Painel de Gestão. */
export function StatTile({
  titulo,
  valor,
  tom,
  className,
}: {
  titulo: string;
  valor: number;
  tom?: "destructive" | "atencao";
  className?: string;
}) {
  return (
    <Card className={cn("justify-center", className)}>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-muted-foreground text-sm">{titulo}</span>
        <span
          className={
            tom === "destructive"
              ? "text-destructive text-3xl font-semibold"
              : tom === "atencao"
                ? "text-3xl font-semibold text-amber-600 dark:text-amber-500"
                : "text-3xl font-semibold"
          }
        >
          {valor}
        </span>
      </CardContent>
    </Card>
  );
}
