import { notFound } from "next/navigation";

import { buscarDetalheCaso } from "@/lib/casos/detalhe";

import { CasoDetalhe } from "./caso-detalhe";

export default async function CasoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalhe = await buscarDetalheCaso(id);

  if (!detalhe) notFound();

  return <CasoDetalhe detalhe={detalhe} />;
}
