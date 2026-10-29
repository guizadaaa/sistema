import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolverLoja } from "@/lib/linkly/loja";
import type { FilialCvc } from "@/lib/supabase/types";
import { carregarVitrine } from "@/lib/vitrine/listar";

import { MateriaisTabs } from "../materiais-tabs";
import { VitrineTela } from "./vitrine-tela";

const FILIAL_PADRAO_ADM: FilialCvc = "1710";

export default async function VitrinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Cada um vê a vitrine da própria filial; adm/adm_master escolhem (?filial=,
  // padrão 1710). A RLS (vitrine_pode_ver) é quem garante.
  const filial = ehAdmin ? (resolverLoja((await searchParams).filial) ?? FILIAL_PADRAO_ADM) : usuario.filial;
  const podeEditar = ehAdmin || (usuario.perfil === "gerente" && usuario.filial === filial);

  return (
    <div className="flex flex-col gap-4">
      <MateriaisTabs ativo="vitrine" />
      {filial ? (
        <VitrineTela
          filial={filial}
          ehAdmin={ehAdmin}
          podeEditar={podeEditar}
          dados={await carregarVitrine(filial)}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Seu usuário não tem filial definida.</p>
      )}
    </div>
  );
}
