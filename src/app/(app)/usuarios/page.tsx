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

  // gerente não tem acesso a Gestão de Usuários (nem SELECT em usuarios via
  // RLS), mas tem a Delegações, ao lado — manda pra lá em vez de pra home.
  if (usuario.perfil === "gerente") {
    redirect("/usuarios/delegacoes");
  }

  // usuarios_select_admin (RLS) libera SELECT completo para adm e
  // adm_master; só adm_master tem policy de UPDATE (usuarios_update_adm_master)
  // e é quem pode convidar (ver actions.ts) — vendedor não chega aqui.
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") {
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

  const usuarios = await listarUsuarios({ filial, perfil });

  return (
    <div className="flex flex-col gap-4">
      {/* Só adm_master enxerga as duas telas — adm só tem esta, sem aba pra alternar. */}
      {usuario.perfil === "adm_master" && <UsuariosTabs ativo="usuarios" />}
      <UsuariosLista
        usuarios={usuarios}
        podeEditar={usuario.perfil === "adm_master"}
        filtros={{ filial, perfil }}
      />
    </div>
  );
}
