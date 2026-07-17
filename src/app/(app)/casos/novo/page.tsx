import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarDonosElegiveis } from "@/lib/casos/dono-elegivel";

import { CasoForm } from "./caso-form";

export default async function NovoCasoPage() {
  const usuario = await requireCurrentUser();
  const donosElegiveis = await listarDonosElegiveis(usuario);

  return <CasoForm donosElegiveis={donosElegiveis} />;
}
