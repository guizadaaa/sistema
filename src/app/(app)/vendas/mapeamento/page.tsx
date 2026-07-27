import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarMapeamentos, listarPendentesDeVinculo } from "@/lib/vendas/mapeamento";

import { VendasTabs } from "../vendas-tabs";
import { MapeamentoLista } from "./mapeamento-lista";

export default async function MapeamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();

  // vendedores_mapeamento_select/_insert (RLS) exigem auth_is_adm_master() —
  // adm (não master) e demais perfis nunca conseguiriam usar esta tela.
  if (usuario.perfil !== "adm_master") {
    redirect("/vendas");
  }

  const sp = await searchParams;
  const nomePrefill = typeof sp.nome === "string" ? sp.nome : undefined;
  const filialPrefill = typeof sp.filial === "string" ? sp.filial : undefined;

  const [mapeamentos, pendentes] = await Promise.all([listarMapeamentos(), listarPendentesDeVinculo()]);

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="mapeamento" perfil={usuario.perfil} />
      {/* key remonta o form (limpando o estado controlado) sempre que um
          vínculo novo é criado e a lista cresce via revalidatePath — mesma
          técnica de complementos-secao.tsx. */}
      <MapeamentoLista
        key={mapeamentos.length}
        mapeamentos={mapeamentos}
        pendentes={pendentes}
        prefill={{ nome: nomePrefill, filial: filialPrefill }}
      />
    </div>
  );
}
