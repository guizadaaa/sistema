import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";

import { VendasTabs } from "../vendas-tabs";
import { ImportarForm } from "./importar-form";

export default async function ImportarVendasPage() {
  const usuario = await requireCurrentUser();

  // vendas_importadas_insert (RLS) exige auth_is_admin() — vendedor/gerente
  // nunca conseguiriam importar mesmo chegando aqui.
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    redirect("/vendas");
  }

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="importar" perfil={usuario.perfil} />
      <ImportarForm />
    </div>
  );
}
