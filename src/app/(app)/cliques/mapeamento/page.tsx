import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarHistoricoVinculos, listarLinks } from "@/lib/linkly/mapeamento";

import { CliquesTabs } from "../cliques-tabs";
import { MapeamentoLista } from "./mapeamento-lista";

export default async function MapeamentoLinklyPage() {
  const usuario = await requireCurrentUser();

  // linkly_links_select/linkly_vendedor_mapeamento_select (RLS) exigem
  // auth_is_adm_master() — adm (não master) e demais perfis nunca
  // conseguiriam usar esta tela.
  if (usuario.perfil !== "adm_master") {
    redirect("/cliques");
  }

  const [links, historico] = await Promise.all([listarLinks(), listarHistoricoVinculos()]);

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="mapeamento" perfil={usuario.perfil} />
      <MapeamentoLista links={links} historico={historico} />
    </div>
  );
}
