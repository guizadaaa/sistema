import { requireCurrentUser } from "@/lib/auth/current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const usuario = await requireCurrentUser();

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Bem-vindo(a), {usuario.nome_completo}</CardTitle>
        <CardDescription>
          Login e controle de acesso funcionando. As telas de casos e dashboard
          entram nos próximos incrementos.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Perfil: {usuario.perfil} {usuario.filial ? `· Filial ${usuario.filial}` : ""}
      </CardContent>
    </Card>
  );
}
