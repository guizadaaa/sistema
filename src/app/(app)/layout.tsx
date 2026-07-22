import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarProximaDelegacaoParaAviso } from "@/lib/delegacoes/listar";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

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
            {/* Usuários e Delegações vivem sob a mesma rota /usuarios (abas
                internas para quem enxerga as duas — hoje só adm_master); um
                único link aqui, cada perfil cai direto no que pode ver. */}
            {(usuario.perfil === "adm" || usuario.perfil === "adm_master" || usuario.perfil === "gerente") && (
              <Link href="/usuarios" className="hover:underline">
                Usuários
              </Link>
            )}
            {usuario.perfil === "adm_master" && (
              <Link href="/auditoria" className="hover:underline">
                Auditoria
              </Link>
            )}
            <Link href="/seguranca" className="hover:underline">
              Segurança
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>
      {proximaDelegacao && <DelegacaoAvisoBanner inicio={proximaDelegacao.inicio} />}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
