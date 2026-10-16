import Link from "next/link";

import type { PerfilUsuario } from "@/lib/supabase/types";

/** Mesmo padrão de vendas-tabs.tsx: Mapeamento e Base do mês são exclusivos adm_master. */
export function CliquesTabs({ ativo, perfil }: { ativo: "cliques" | "mapeamento" | "base"; perfil: PerfilUsuario }) {
  const tabs = [
    { href: "/cliques", label: "Cliques", chave: "cliques" as const, visivel: true },
    { href: "/cliques/mapeamento", label: "Mapeamento", chave: "mapeamento" as const, visivel: perfil === "adm_master" },
    { href: "/cliques/base", label: "Base do mês", chave: "base" as const, visivel: perfil === "adm_master" },
  ].filter((tab) => tab.visivel);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex gap-4 border-b text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.chave}
          href={tab.href}
          className={
            tab.chave === ativo
              ? "border-primary text-foreground -mb-px border-b-2 pb-2 font-medium"
              : "text-muted-foreground hover:text-foreground -mb-px pb-2"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
