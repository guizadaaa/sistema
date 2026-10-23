import { notFound, redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { podeTransferirLoja } from "@/lib/usuarios/transferencia";

import { FichaUsuario } from "./ficha-usuario";

export default async function FichaUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireCurrentUser();
  if (usuario.perfil === "vendedor") redirect("/");

  const { id } = await params;
  const supabase = await createClient();

  // RLS: adm/adm_master veem todos; gerente, a própria loja.
  const { data: alvo, error } = await supabase
    .from("usuarios")
    .select("id, nome_completo, email, perfil, filial, ativo")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!alvo) notFound();

  const { data: historico, error: erroHistorico } = await supabase.rpc("usuario_transferencias_historico", { p_usuario: id });
  if (erroHistorico) throw erroHistorico;

  return <FichaUsuario alvo={alvo} historico={historico ?? []} podeTransferir={podeTransferirLoja(usuario, alvo)} />;
}
