import { Card, CardContent } from "@/components/ui/card";

/** Card de número de destaque — mesmo visual no Dashboard e no Painel de Gestão. */
export function StatTile({
  titulo,
  valor,
  tom,
}: {
  titulo: string;
  valor: number;
  tom?: "destructive" | "atencao";
}) {
  return (
    <Card>
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
