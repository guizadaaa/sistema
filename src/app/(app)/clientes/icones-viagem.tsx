import { BedDouble, Bus, BusFront, Camera, Car, Globe, Map, Plane, PlaneTakeoff, Route, ShieldCheck, Ship, Star, Ticket, type LucideIcon } from "lucide-react";

import { PRODUTOS } from "@/lib/clientes/produtos";
import { isTipoServico, TIPO_SERVICO_LABELS, TIPOS_SERVICO, type TipoServico } from "@/lib/clientes/tipos-servico";

// Ícones só nos resultados (o filtro e o CSV seguem com texto). Cada ícone
// tem aria-label com o nome e uma dica (tooltip) que aparece na hora ao
// passar o mouse ou focar pelo teclado — no lugar do title nativo, que
// demora e não aparece no toque.

/** Ícone com nome: aria-label + dica no hover/foco. */
function ComDica({ nome, children, className, ...dados }: { nome: string; children: React.ReactNode; className?: string } & Record<`data-${string}`, string | number>) {
  return (
    <span role="img" aria-label={nome} tabIndex={0} className={`group relative inline-flex outline-none ${className ?? ""}`} {...dados}>
      {children}
      <span
        aria-hidden
        className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        data-dica={nome}
      >
        {nome}
      </span>
    </span>
  );
}

const ICONE_SERVICO: Record<TipoServico, LucideIcon> = {
  aereo: Plane,
  hotel: BedDouble,
  ingresso: Ticket,
  passeio: Camera,
  transfer: Bus,
  seguro: ShieldCheck,
  cruzeiro: Ship,
  carro: Car,
};

const ICONE_PRODUTO: Record<number, LucideIcon> = {
  2: Map,
  3: Route,
  4: Star,
  5: PlaneTakeoff,
  7: BusFront,
  8: Ship,
  9: Globe,
};

/** Serviços em ícones, na ordem fixa de TIPOS_SERVICO. */
export function ServicosIcones({ tipos }: { tipos: string[] }) {
  const presentes = TIPOS_SERVICO.filter((t) => tipos.filter(isTipoServico).includes(t));
  if (presentes.length === 0) return null;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5" data-testid="servicos">
      {presentes.map((t) => {
        const Icone = ICONE_SERVICO[t];
        return (
          <ComDica key={t} nome={TIPO_SERVICO_LABELS[t]} data-testid="tipo" data-tipo={t}>
            <Icone className="size-4" aria-hidden />
          </ComDica>
        );
      })}
    </span>
  );
}

/** Produtos (1º dígito do Roteiro Systur) em ícones dentro de uma pílula; "Outros" não aparece. */
export function ProdutosIcones({ produtos }: { produtos: number[] }) {
  const presentes = PRODUTOS.filter((p) => produtos.includes(p.codigo));
  if (presentes.length === 0) return null;
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1" data-testid="produtos">
      {presentes.map((p) => {
        const Icone = ICONE_PRODUTO[p.codigo];
        return (
          <ComDica
            key={p.codigo}
            nome={p.rotulo}
            data-testid="produto"
            data-produto={p.codigo}
            className="border-muted-foreground/40 items-center rounded-full border px-1.5 py-0.5"
          >
            <Icone className="size-3.5" aria-hidden />
          </ComDica>
        );
      })}
    </span>
  );
}
