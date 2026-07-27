"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { PerfilUsuario } from "@/lib/supabase/types";

const LINKS: Array<{ href: string; label: string; visivel: (perfil: PerfilUsuario) => boolean }> = [
  { href: "/casos", label: "Casos", visivel: () => true },
  {
    href: "/painel",
    label: "Painel",
    visivel: (perfil) => perfil === "adm" || perfil === "adm_master" || perfil === "gerente",
  },
  // Usuários e Delegações vivem sob a mesma rota /usuarios (abas internas
  // para quem enxerga as duas — hoje só adm_master); um único link aqui,
  // cada perfil cai direto no que pode ver.
  {
    href: "/usuarios",
    label: "Usuários",
    visivel: (perfil) => perfil === "adm" || perfil === "adm_master" || perfil === "gerente",
  },
  { href: "/auditoria", label: "Auditoria", visivel: (perfil) => perfil === "adm_master" },
  { href: "/materiais", label: "Materiais de apoio", visivel: () => true },
  { href: "/seguranca", label: "Segurança", visivel: () => true },
];

export function NavLinks({ perfil }: { perfil: PerfilUsuario }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.filter((link) => link.visivel(perfil)).map((link) => {
        const ativo = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "relative rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              ativo &&
                "bg-accent font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-3 after:h-0.5 after:rounded-full after:bg-foreground after:content-['']"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
