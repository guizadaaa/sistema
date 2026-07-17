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
        <CardDescription>
          Login e controle de acesso funcionando. Dashboard e acompanhamento de
          casos entram nos próximos incrementos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
        <span>
          Perfil: {usuario.perfil} {usuario.filial ? `· Filial ${usuario.filial}` : ""}
        </span>
        <Button asChild className="w-fit">
          <Link href="/casos/novo">Adicionar caso</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
