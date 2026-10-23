import Link from "next/link";

/**
 * Só renderizada para quem enxerga as duas telas (adm_master e gerente) —
 * adm só vê Usuários, então não faz sentido mostrar uma aba pra algo que
 * ele não pode abrir. Ver o comentário de controle de acesso em cada page.tsx.
 */
export function UsuariosTabs({ ativo }: { ativo: "usuarios" | "delegacoes" }) {
  const tabs = [
    { href: "/usuarios", label: "Usuários", chave: "usuarios" as const },
    { href: "/usuarios/delegacoes", label: "Delegações", chave: "delegacoes" as const },
  ];

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
