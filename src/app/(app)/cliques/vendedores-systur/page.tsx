import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolverLoja } from "@/lib/linkly/loja";
import { listarMapeamentoSystur, listarUsuariosParaVinculo } from "@/lib/conferencia/mapeamento-systur";

import { CliquesTabs } from "../cliques-tabs";
import { VendedoresSysturLista } from "./vendedores-systur-lista";

export default async function VendedoresSysturPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  // Escrita em systur_vendedor_mapeamento: auth_is_admin() (RLS + grant por coluna).
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") redirect("/cliques");

  // ?loja= e ?sem_vinculo=1 ficam na URL — o revalidatePath do salvar mantém os filtros.
  const sp = await searchParams;
  const loja = resolverLoja(sp.loja);
  const semVinculo = sp.sem_vinculo === "1";

  const [linhas, usuarios] = await Promise.all([listarMapeamentoSystur({ loja, semVinculo }), listarUsuariosParaVinculo()]);

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="systur" perfil={usuario.perfil} loja={loja} />
      <VendedoresSysturLista linhas={linhas} usuarios={usuarios} loja={loja} semVinculo={semVinculo} />
    </div>
  );
}
