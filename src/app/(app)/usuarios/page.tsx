import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarUsuarios } from "@/lib/usuarios/listar";

import { UsuariosLista } from "./usuarios-lista";

export default async function UsuariosPage() {
  const usuario = await requireCurrentUser();

  // usuarios_select_admin (RLS) libera SELECT completo para adm e
  // adm_master; só adm_master tem policy de UPDATE (usuarios_update_adm_master)
  // e é quem pode convidar (ver actions.ts) — vendedor/gerente não chegam aqui.
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
    redirect("/");
  }

  const usuarios = await listarUsuarios();

  return <UsuariosLista usuarios={usuarios} podeEditar={usuario.perfil === "adm_master"} />;
}
