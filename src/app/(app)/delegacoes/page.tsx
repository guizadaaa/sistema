import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarDelegacoes } from "@/lib/delegacoes/listar";
import { createClient } from "@/lib/supabase/server";

import { DelegacoesLista } from "./delegacoes-lista";

export default async function DelegacoesPage() {
  const usuario = await requireCurrentUser();

  // delegacoes_select (RLS) só libera linhas para adm_master (todas) ou para
  // o próprio gerente (gerente_id = auth.uid()) — vendedor e adm não veem
  // nada, então nem faz sentido mostrar a página a eles.
  if (usuario.perfil !== "adm_master" && usuario.perfil !== "gerente") {
    redirect("/");
  }

  const delegacoes = await listarDelegacoes();

  let gerentes: { id: string; nome_completo: string }[] = [];
  if (usuario.perfil === "adm_master") {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome_completo")
      .eq("perfil", "gerente")
      .eq("ativo", true)
      .order("nome_completo");
    if (error) throw error;
    gerentes = data ?? [];
  }

  return (
    <DelegacoesLista
      delegacoes={delegacoes}
      gerentes={gerentes}
      podeGerenciar={usuario.perfil === "adm_master"}
    />
  );
}
