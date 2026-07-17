import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const usuario = await requireCurrentUser();

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Bem-vindo(a), {usuario.nome_completo}</CardTitle>
        <CardDescription>Dashboard entra num próximo incremento.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
        <span>
          Perfil: {usuario.perfil} {usuario.filial ? `· Filial ${usuario.filial}` : ""}
        </span>
        <div className="flex gap-2">
          <Button asChild className="w-fit">
            <Link href="/casos/novo">Adicionar caso</Link>
          </Button>
          <Button asChild variant="outline" className="w-fit">
            <Link href="/casos">Acompanhar casos</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
