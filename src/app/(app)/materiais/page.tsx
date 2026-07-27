import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarMateriaisApoio } from "@/lib/materiais-apoio/listar";

import { MateriaisApoioLista } from "./materiais-lista";

export default async function MateriaisApoioPage() {
  const usuario = await requireCurrentUser();
  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  const materiais = await listarMateriaisApoio();

  return <MateriaisApoioLista materiais={materiais} ehAdmin={ehAdmin} />;
}
