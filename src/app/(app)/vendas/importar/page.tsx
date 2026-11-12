import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarImportacoesVendas } from "@/lib/vendas/importacoes";

import { VendasTabs } from "../vendas-tabs";
import { ImportacoesLista } from "./importacoes-lista";
import { ImportarForm } from "./importar-form";

export default async function ImportarVendasPage() {
  const usuario = await requireCurrentUser();
  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Importar é só adm/adm_master (vendas_importadas_insert exige
  // auth_is_admin()); gerente entra só pra ver as importações da própria
  // loja e quem confirmou (listar_vendas_importacoes filtra).
  if (!ehAdmin && usuario.perfil !== "gerente") {
    redirect("/vendas");
  }

  const importacoes = await listarImportacoesVendas();

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="importar" perfil={usuario.perfil} />
      {ehAdmin && <ImportarForm />}
      <ImportacoesLista importacoes={importacoes} />
    </div>
  );
}
