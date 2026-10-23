import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarUsuarios } from "@/lib/usuarios/listar";
import { FILIAIS_USUARIO, PERFIS_USUARIO } from "@/lib/validation/usuario";
import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

import { UsuariosLista } from "./usuarios-lista";
import { UsuariosTabs } from "./usuarios-tabs";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();

  // usuarios_select_admin (RLS) libera SELECT completo para adm e
  // adm_master; só adm_master tem policy de UPDATE (usuarios_update_adm_master)
  // e é quem pode convidar (ver actions.ts). O gerente vê a lista só leitura
  // da própria loja (usuarios_select_filial_gerente) para abrir a ficha e
  // transferir vendedores de loja — vendedor não chega aqui.
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master" && usuario.perfil !== "gerente") {
    redirect("/");
  }

  const sp = await searchParams;
  const filial =
    typeof sp.filial === "string" && (FILIAIS_USUARIO as readonly string[]).includes(sp.filial)
      ? (sp.filial as FilialCvc)
      : undefined;
  const perfil =
    typeof sp.perfil === "string" && (PERFIS_USUARIO as readonly string[]).includes(sp.perfil)
      ? (sp.perfil as PerfilUsuario)
      : undefined;

  const mostrarInativos = sp.mostrarInativos === "1";

  const usuarios = await listarUsuarios({ filial, perfil, mostrarInativos });

  return (
    <div className="flex flex-col gap-4">
      {/* adm_master e gerente enxergam as duas telas — adm só tem esta, sem aba pra alternar. */}
      {(usuario.perfil === "adm_master" || usuario.perfil === "gerente") && <UsuariosTabs ativo="usuarios" />}
      <UsuariosLista
        usuarios={usuarios}
        podeEditar={usuario.perfil === "adm_master"}
        filtros={{ filial, perfil, mostrarInativos }}
      />
    </div>
  );
}
