import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type CurrentUser = Database["public"]["Tables"]["usuarios"]["Row"];

/**
 * Carrega o perfil de aplicação (usuarios) do usuário autenticado.
 * Redireciona para /login se não houver sessão — nunca retorna null para
 * uma rota que assume usuário logado, evitando checagens de null espalhadas.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !usuario) {
    // Sessão válida no Auth mas sem perfil correspondente em public.usuarios
    // (não deveria acontecer — o trigger on_auth_user_created garante o
    // vínculo — mas falhar de forma explícita é mais seguro que prosseguir
    // sem perfil/filial definidos).
    redirect("/login?erro=perfil_nao_encontrado");
  }

  if (!usuario.ativo) {
    // RLS já bloquearia o acesso aos dados, mas sem isso o usuário veria um
    // app "vazio" sem entender por quê — melhor encerrar a sessão e explicar.
    await supabase.auth.signOut();
    redirect("/login?erro=conta_desativada");
  }

  return usuario;
}
