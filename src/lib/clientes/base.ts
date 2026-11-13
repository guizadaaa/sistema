import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

import type { FiltrosBase } from "./base-util";

export type ClienteBase = Database["public"]["Functions"]["base_clientes_buscar"]["Returns"][number];
export type CompraCliente = Database["public"]["Functions"]["base_clientes_compras"]["Returns"][number];
export type JanelaColeta = Database["public"]["Tables"]["base_coleta_janelas"]["Row"];
export type ModeloMensagem = Pick<Database["public"]["Tables"]["mensagem_modelos"]["Row"], "id" | "chave" | "titulo" | "texto">;
export type FiltroSalvo = Pick<Database["public"]["Tables"]["cliente_filtros_salvos"]["Row"], "id" | "nome" | "filtros">;

export const POR_PAGINA = 50;
export const LIMITE_EXPORTACAO = 20_000;

/** Página de clientes (a busca, a campanha e a paginação rodam no banco). */
export async function buscarClientesBase(filtros: FiltrosBase, pagina: number, limite = POR_PAGINA): Promise<ClienteBase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("base_clientes_buscar", {
    p_filtros: filtros as Record<string, string>,
    p_limite: limite,
    p_offset: (Math.max(pagina, 1) - 1) * limite,
  });
  if (error) throw error;
  return data ?? [];
}

export async function listarComprasCliente(clienteId: string): Promise<CompraCliente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("base_clientes_compras", { p_cliente: clienteId });
  if (error) throw error;
  return data ?? [];
}

export async function listarVendedoresBase(): Promise<{ vendedor: string; loja: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("base_clientes_vendedores", {});
  if (error) throw error;
  return data ?? [];
}

export async function sugerirDestinos(termo: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("base_clientes_destinos", { p_termo: termo, p_limite: 10 });
  if (error) throw error;
  return (data ?? []).map((d) => d.destino);
}

export async function listarModelosMensagem(): Promise<ModeloMensagem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensagem_modelos")
    .select("id, chave, titulo, texto")
    .eq("ativo", true)
    .order("titulo");
  if (error) throw error;
  return data ?? [];
}

export async function listarFiltrosSalvos(): Promise<FiltroSalvo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cliente_filtros_salvos").select("id, nome, filtros").order("nome");
  if (error) throw error;
  return data ?? [];
}

/** RLS: só adm_master lê. */
export async function listarJanelasColeta(): Promise<JanelaColeta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("base_coleta_janelas").select("*").order("loja").order("de");
  if (error) throw error;
  return data ?? [];
}
