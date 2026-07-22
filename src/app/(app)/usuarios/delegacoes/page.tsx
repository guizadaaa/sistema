import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarDelegacoes } from "@/lib/delegacoes/listar";
import { createClient } from "@/lib/supabase/server";

import { UsuariosTabs } from "../usuarios-tabs";
import { DelegacoesLista } from "./delegacoes-lista";

export default async function DelegacoesPage() {
  const usuario = await requireCurrentUser();

  // delegacoes_select (RLS) só libera linhas para adm_master (todas) ou para
  // o próprio gerente (gerente_id = auth.uid()) — vendedor não vê nada, e
  // adm não tem acesso aqui (mas tem em /usuarios, ao lado) — manda pra lá
  // em vez de pra home, já que ele tem uma aba de verdade pra ver.
  if (usuario.perfil === "adm") {
    redirect("/usuarios");
  }
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
    <div className="flex flex-col gap-4">
      {/* Só adm_master enxerga as duas telas — gerente só tem esta, sem aba pra alternar. */}
      {usuario.perfil === "adm_master" && <UsuariosTabs ativo="delegacoes" />}
      <DelegacoesLista
        delegacoes={delegacoes}
        gerentes={gerentes}
        podeGerenciar={usuario.perfil === "adm_master"}
      />
    </div>
  );
}
