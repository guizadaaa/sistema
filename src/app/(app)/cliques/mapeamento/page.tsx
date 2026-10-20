import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarHistoricoVinculos, listarLinks } from "@/lib/linkly/mapeamento";

import { isFilialCvc } from "../../casos/casos-lista";

import { CliquesTabs } from "../cliques-tabs";
import { MapeamentoLista } from "./mapeamento-lista";

export default async function MapeamentoLinklyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();

  // linkly_links_select/linkly_vendedor_mapeamento_select (RLS) exigem
  // auth_is_adm_master() — adm (não master) e demais perfis nunca
  // conseguiriam usar esta tela.
  if (usuario.perfil !== "adm_master") {
    redirect("/cliques");
  }

  // ?loja=1710 — inválido ou ausente = todas as lojas. Fica na URL, então a
  // revalidação depois de "Trocar/Atribuir vendedor" mantém o filtro.
  const sp = await searchParams;
  const loja = typeof sp.loja === "string" && isFilialCvc(sp.loja) ? sp.loja : undefined;

  const [links, historico] = await Promise.all([listarLinks({ filial: loja }), listarHistoricoVinculos({ filial: loja })]);

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="mapeamento" perfil={usuario.perfil} />
      <MapeamentoLista links={links} historico={historico} loja={loja} />
    </div>
  );
}
