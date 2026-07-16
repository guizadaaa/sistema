import { requireCurrentUser } from "@/lib/auth/current-user";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";

import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{usuario.nome_completo}</span>
          <span className="text-muted-foreground text-xs">
            {PERFIL_LABELS[usuario.perfil]}
            {usuario.filial ? ` · ${FILIAL_LABELS[usuario.filial]}` : ""}
          </span>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
