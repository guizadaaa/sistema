import { notFound } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarDetalheCaso } from "@/lib/casos/detalhe";
import { podeAvancarStatus, podeConduzirFluxo } from "@/lib/casos/permissoes";

import { CasoDetalhe } from "./caso-detalhe";

export default async function CasoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireCurrentUser();
  const detalhe = await buscarDetalheCaso(id);

  if (!detalhe) notFound();

  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const ehAdmMaster = usuario.perfil === "adm_master";
  const [podeConduzir, podeAvancar] = await Promise.all([
    podeConduzirFluxo(usuario, detalhe.caso.filial),
    podeAvancarStatus(usuario, detalhe.caso),
  ]);

  return (
    <CasoDetalhe
      detalhe={detalhe}
      podeConduzirFluxo={podeConduzir}
      podeAvancarStatus={podeAvancar}
      ehAdmin={ehAdmin}
      ehAdmMaster={ehAdmMaster}
    />
  );
}
