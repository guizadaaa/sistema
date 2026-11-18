import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarFeriados } from "@/lib/feriados/listar";

import { VendasTabs } from "../vendas-tabs";
import { FeriadosLista } from "./feriados-lista";

/** Feriados e pontos facultativos (adm/adm_master; RLS feriados_* também exige). */
export default async function FeriadosPage() {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") redirect("/vendas");

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="feriados" perfil={usuario.perfil} />
      <h1 className="text-xl font-semibold">Feriados</h1>
      <FeriadosLista feriados={await listarFeriados()} />
    </div>
  );
}
