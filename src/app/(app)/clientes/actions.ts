"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { lerFiltros } from "@/lib/clientes/base-util";
import { listarComprasCliente, sugerirDestinos, type CompraCliente } from "@/lib/clientes/base";
import { createClient } from "@/lib/supabase/server";

/** Compras visíveis do cliente (expandir na lista). */
export async function buscarComprasCliente(clienteId: string): Promise<{ compras?: CompraCliente[]; error?: string }> {
  await requireCurrentUser();
  try {
    return { compras: await listarComprasCliente(clienteId) };
  } catch (erro) {
    console.error("Erro ao listar compras do cliente:", erro);
    return { error: "Não foi possível carregar as compras." };
  }
}

export async function buscarSugestoesDestino(termo: string): Promise<string[]> {
  await requireCurrentUser();
  if (termo.trim().length < 2) return [];
  try {
    return await sugerirDestinos(termo.slice(0, 60));
  } catch (erro) {
    console.error("Erro ao sugerir destinos:", erro);
    return [];
  }
}

export async function salvarFiltroCliente(nome: string, query: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const nomeLimpo = nome.trim().slice(0, 80);
  if (!nomeLimpo) return { error: "Dê um nome ao filtro." };
  const filtros = lerFiltros(Object.fromEntries(new URLSearchParams(query)));

  const supabase = await createClient();
  const { error } = await supabase.from("cliente_filtros_salvos").insert({ nome: nomeLimpo, filtros: filtros as Record<string, string> });
  if (error) {
    if (error.code === "23505") return { error: "Você já tem um filtro com esse nome." };
    console.error("Erro ao salvar filtro:", error);
    return { error: "Não foi possível salvar o filtro." };
  }
  revalidatePath("/clientes");
  return {};
}

export async function excluirFiltroCliente(id: string): Promise<{ error?: string }> {
  await requireCurrentUser();
  const supabase = await createClient();
  const { error } = await supabase.from("cliente_filtros_salvos").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir filtro:", error);
    return { error: "Não foi possível excluir o filtro." };
  }
  revalidatePath("/clientes");
  return {};
}

/** Texto dos modelos de mensagem (recompra, venda adicional): adm/adm_master (RLS). */
export async function salvarModeloMensagem(id: string, texto: string): Promise<{ error?: string }> {
  const usuario = await requireCurrentUser();
  if (usuario.perfil !== "adm" && usuario.perfil !== "adm_master") return { error: "Só adm edita os modelos." };
  const supabase = await createClient();
  const { error } = await supabase.from("mensagem_modelos").update({ texto: texto.slice(0, 4000) }).eq("id", id);
  if (error) {
    console.error("Erro ao salvar modelo:", error);
    return { error: "Não foi possível salvar o modelo." };
  }
  revalidatePath("/clientes");
  return {};
}
