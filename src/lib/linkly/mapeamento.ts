import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FilialCvc } from "@/lib/supabase/types";

export type LinkComVendedorAtual = {
  id: string;
  workspaceSecret: string;
  linklyLinkId: string;
  shortUrl: string;
  tipo: "vendedor" | "vitrine";
  filial: FilialCvc;
  vendedorAtualId: string | null;
  vendedorAtualNome: string | null;
  vendedorAtualEmail: string | null;
  vigenteDesde: string | null;
};

/** RLS (linkly_links_select / linkly_vendedor_mapeamento_select) já restringe a leitura a adm_master. */
export async function listarLinks(): Promise<LinkComVendedorAtual[]> {
  const supabase = await createClient();

  const { data: links, error } = await supabase
    .from("linkly_links")
    .select("id, workspace_secret, linkly_link_id, short_url, tipo, filial")
    .order("tipo")
    .order("filial");
  if (error) throw error;

  const { data: vigentes, error: vigentesError } = await supabase
    .from("linkly_vendedor_mapeamento")
    .select("link_id, usuario_id, vigente_desde")
    .is("vigente_ate", null);
  if (vigentesError) throw vigentesError;

  const idsUsuarios = [...new Set((vigentes ?? []).map((v) => v.usuario_id))];
  const { data: usuarios, error: usuariosError } =
    idsUsuarios.length > 0
      ? await supabase.from("usuarios").select("id, nome_completo, email").in("id", idsUsuarios)
      : { data: [], error: null };
  if (usuariosError) throw usuariosError;

  const usuariosPorId = new Map((usuarios ?? []).map((u) => [u.id, u]));
  const vigentePorLink = new Map((vigentes ?? []).map((v) => [v.link_id, v]));

  return (links ?? []).map((l) => {
    const vigente = vigentePorLink.get(l.id);
    const usuario = vigente ? usuariosPorId.get(vigente.usuario_id) : undefined;
    return {
      id: l.id,
      workspaceSecret: l.workspace_secret,
      linklyLinkId: l.linkly_link_id,
      shortUrl: l.short_url,
      tipo: l.tipo,
      filial: l.filial,
      vendedorAtualId: vigente?.usuario_id ?? null,
      vendedorAtualNome: usuario?.nome_completo ?? null,
      vendedorAtualEmail: usuario?.email ?? null,
      vigenteDesde: vigente?.vigente_desde ?? null,
    };
  });
}

export type HistoricoVinculo = {
  id: string;
  linkId: string;
  shortUrl: string;
  usuarioNome: string;
  usuarioEmail: string;
  vigenteDesde: string;
  vigenteAte: string | null;
};

/** Histórico completo (todos os links) — inclui vínculos já fechados, nunca editados/apagados. */
export async function listarHistoricoVinculos(): Promise<HistoricoVinculo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("linkly_vendedor_mapeamento")
    .select("id, link_id, usuario_id, vigente_desde, vigente_ate")
    .order("vigente_desde", { ascending: false });
  if (error) throw error;

  const linhas = data ?? [];
  const idsUsuarios = [...new Set(linhas.map((v) => v.usuario_id))];
  const idsLinks = [...new Set(linhas.map((v) => v.link_id))];

  const [{ data: usuarios, error: usuariosError }, { data: links, error: linksError }] = await Promise.all([
    idsUsuarios.length > 0
      ? supabase.from("usuarios").select("id, nome_completo, email").in("id", idsUsuarios)
      : Promise.resolve({ data: [], error: null }),
    idsLinks.length > 0
      ? supabase.from("linkly_links").select("id, short_url").in("id", idsLinks)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (usuariosError) throw usuariosError;
  if (linksError) throw linksError;

  const usuariosPorId = new Map((usuarios ?? []).map((u) => [u.id, u]));
  const shortUrlPorLink = new Map((links ?? []).map((l) => [l.id, l.short_url]));

  return linhas.map((v) => ({
    id: v.id,
    linkId: v.link_id,
    shortUrl: shortUrlPorLink.get(v.link_id) ?? "—",
    usuarioNome: usuariosPorId.get(v.usuario_id)?.nome_completo ?? "—",
    usuarioEmail: usuariosPorId.get(v.usuario_id)?.email ?? "—",
    vigenteDesde: v.vigente_desde,
    vigenteAte: v.vigente_ate,
  }));
}
