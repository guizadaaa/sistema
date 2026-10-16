import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { carregarLinksParaBase } from "@/lib/linkly/base-mes";
import { mesAtualSaoPaulo } from "@/lib/linkly/mes";

import { CliquesTabs } from "../cliques-tabs";
import { BaseMesForm } from "./base-mes-form";

export default async function BaseMesPage() {
  const usuario = await requireCurrentUser();
  // linkly_definir_base_mes exige auth_is_adm_master() — demais perfis nem veem a tela.
  if (usuario.perfil !== "adm_master") redirect("/cliques");

  const mes = mesAtualSaoPaulo();
  const links = await carregarLinksParaBase(mes);

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="base" perfil={usuario.perfil} />
      <BaseMesForm mes={mes} links={links} />
    </div>
  );
}
