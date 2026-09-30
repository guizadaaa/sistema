import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarCategoriasMateriaisApoio, listarMateriaisApoio } from "@/lib/materiais-apoio/listar";

import { MateriaisApoioLista } from "./materiais-lista";

export default async function MateriaisApoioPage() {
  const usuario = await requireCurrentUser();
  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const ehAdmMaster = usuario.perfil === "adm_master";

  const [materiais, categorias] = await Promise.all([listarMateriaisApoio(), listarCategoriasMateriaisApoio()]);

  return <MateriaisApoioLista materiais={materiais} categorias={categorias} ehAdmin={ehAdmin} ehAdmMaster={ehAdmMaster} />;
}
