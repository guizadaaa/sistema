import Link from "next/link";

/** Mesmo padrão de cliques-tabs.tsx / usuarios-tabs.tsx. Todos os perfis veem as duas abas. */
export function MateriaisTabs({ ativo }: { ativo: "documentos" | "vitrine" }) {
  const tabs = [
    { href: "/materiais", label: "Documentos", chave: "documentos" as const },
    { href: "/materiais/vitrine", label: "Vitrine", chave: "vitrine" as const },
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
