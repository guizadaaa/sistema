"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILIAL_LABELS } from "@/lib/labels";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

/**
 * Filtro ?loja= das telas de Cliques (Cliques, Mapeamento, Base do mês).
 * Mesmo padrão do SeletorMes: mantém os demais parâmetros da URL (?mes=), e
 * como o filtro fica na URL, revalidatePath das actions o preserva.
 */
export function SeletorLoja({ loja }: { loja?: FilialCvc }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="filtro-loja" className="text-sm">
        Loja
      </Label>
      <Select
        value={loja ?? "todas"}
        onValueChange={(nova) => {
          const params = new URLSearchParams(searchParams.toString());
          if (nova === "todas") params.delete("loja");
          else params.set("loja", nova);
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        <SelectTrigger id="filtro-loja" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as lojas</SelectItem>
          {FILIAIS.map((f) => (
            <SelectItem key={f} value={f}>
              {FILIAL_LABELS[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
