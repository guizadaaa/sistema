import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarProximaDelegacaoParaAviso } from "@/lib/delegacoes/listar";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";

import { DelegacaoAvisoBanner } from "./delegacao-aviso-banner";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireCurrentUser();

  // Só gerente pode ter uma delegação agendada em seu nome (adm_id sempre é
  // adm_master, gerente_id sempre gerente — ver validate_delegacao).
  const proximaDelegacao =
    usuario.perfil === "gerente" ? await buscarProximaDelegacaoParaAviso(usuario.id) : null;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{usuario.nome_completo}</span>
            <span className="text-muted-foreground text-xs">
              {PERFIL_LABELS[usuario.perfil]}
              {usuario.filial ? ` · ${FILIAL_LABELS[usuario.filial]}` : ""}
            </span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/casos" className="hover:underline">
              Casos
            </Link>
            {(usuario.perfil === "adm" || usuario.perfil === "adm_master") && (
              <Link href="/usuarios" className="hover:underline">
                Usuários
              </Link>
            )}
            {(usuario.perfil === "adm_master" || usuario.perfil === "gerente") && (
              <Link href="/delegacoes" className="hover:underline">
                Delegações
              </Link>
            )}
            {usuario.perfil === "adm_master" && (
              <Link href="/auditoria" className="hover:underline">
                Auditoria
              </Link>
            )}
          </nav>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </header>
      {proximaDelegacao && <DelegacaoAvisoBanner inicio={proximaDelegacao.inicio} />}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
