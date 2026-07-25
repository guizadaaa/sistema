import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarProximaDelegacaoParaAviso } from "@/lib/delegacoes/listar";
import { FILIAL_LABELS, PERFIL_LABELS } from "@/lib/labels";
import { buscarNotificacoesRecentes, contarNotificacoesNaoLidas } from "@/lib/notificacoes/listar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

import { DelegacaoAvisoBanner } from "./delegacao-aviso-banner";
import { NavLinks } from "./nav-links";
import { PopupPrazos } from "./popup-prazos";
import { SinoNotificacoes } from "./sino-notificacoes";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireCurrentUser();

  // Só gerente pode ter uma delegação agendada em seu nome (adm_id sempre é
  // adm_master, gerente_id sempre gerente — ver validate_delegacao).
  const proximaDelegacao =
    usuario.perfil === "gerente" ? await buscarProximaDelegacaoParaAviso(usuario.id) : null;

  const [naoLidas, recentes] = await Promise.all([contarNotificacoesNaoLidas(), buscarNotificacoesRecentes(10)]);

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
          <NavLinks perfil={usuario.perfil} />
        </div>
        <div className="flex items-center gap-2">
          <SinoNotificacoes naoLidasInicial={naoLidas} recentesIniciais={recentes} />
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
      <PopupPrazos />
    </div>
  );
}
