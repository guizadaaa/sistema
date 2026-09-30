import Link from "next/link";

import { Button } from "@/components/ui/button";

type PaginacaoProps = {
  pagina: number;
  totalPaginas: number;
  /** Monta o href de cada página — quem chama decide o nome do parâmetro e preserva o resto da URL. */
  hrefPagina: (pagina: number) => string;
};

/** Botões numerados via link (sem estado no cliente) — a página vive na URL. */
export function Paginacao({ pagina, totalPaginas, hrefPagina }: PaginacaoProps) {
  if (totalPaginas <= 1) return null;

  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center gap-1 pt-3">
      {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
        <Button
          key={n}
          asChild
          size="sm"
          variant={n === pagina ? "default" : "outline"}
          className="min-w-8"
        >
          <Link href={hrefPagina(n)} scroll={false} aria-current={n === pagina ? "page" : undefined}>
            {n}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
