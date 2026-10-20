import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { carregarLinksParaBase } from "@/lib/linkly/base-mes";
import { filtrarPorLoja, resolverLoja } from "@/lib/linkly/loja";
import { mesAtualSaoPaulo } from "@/lib/linkly/mes";

import { CliquesTabs } from "../cliques-tabs";
import { SeletorLoja } from "../seletor-loja";
import { BaseMesForm } from "./base-mes-form";

export default async function BaseMesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  // linkly_definir_base_mes exige auth_is_adm_master() — demais perfis nem veem a tela.
  if (usuario.perfil !== "adm_master") redirect("/cliques");

  // ?loja= limita a prévia (e, portanto, o que é gravado) aos links da loja.
  const loja = resolverLoja((await searchParams).loja);
  const mes = mesAtualSaoPaulo();
  const links = filtrarPorLoja(await carregarLinksParaBase(mes), loja);

  return (
    <div className="flex flex-col gap-4">
      <CliquesTabs ativo="base" perfil={usuario.perfil} loja={loja} />
      <SeletorLoja loja={loja} />
      {/* key: trocar de loja zera a prévia (só os links exibidos são gravados). */}
      <BaseMesForm key={loja ?? "todas"} mes={mes} links={links} />
    </div>
  );
}
