import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FilialCvc } from "@/lib/supabase/types";

import {
  encontrarLinkCorrespondente,
  extrairLista,
  extrairWorkspaceId,
} from "../../../supabase/functions/sincronizar-linkly/matching";
import { extrairContagensPorLink, LINKLY_API_BASE, trechoBrutoSeguro, urlContadoresPorLink } from "./contagem-linkly";

// Tudo aqui usa a service_role (linkly_links/linkly_cliques_totais/snapshots
// não são legíveis por authenticated, e a API key do Linkly só sai do Vault
// via service_role). Só chamar depois de checar perfil adm_master — ver
// src/app/(app)/cliques/base/actions.ts e page.tsx.

export type SituacaoBase = "sem_base" | "base_manual" | "snapshot_real" | "sem_total";

export type LinkParaBase = {
  linkId: string;
  shortUrl: string;
  filial: FilialCvc;
  tipo: "vendedor" | "vitrine";
  workspaceSecret: string;
  linklyLinkId: string;
  totalAtual: number | null;
  totalAtualizadoEm: string | null;
  situacao: SituacaoBase;
  /** Base já gravada para o mês (manual ou real), se houver. */
  baseAtual: number | null;
};

/** mes = "YYYY-MM-01" (mês atual). A base fica no dia anterior a ele. */
export async function carregarLinksParaBase(mes: string): Promise<LinkParaBase[]> {
  const admin = createAdminClient();
  const dataBase = diaAnterior(mes);

  const [links, totais, snapshots] = await Promise.all([
    admin.from("linkly_links").select("id, short_url, filial, tipo, workspace_secret, linkly_link_id").order("filial").order("short_url"),
    admin.from("linkly_cliques_totais").select("link_id, total_cliques, atualizado_em"),
    admin.from("linkly_cliques_snapshots").select("link_id, total, origem").eq("data", dataBase),
  ]);
  if (links.error) throw links.error;
  if (totais.error) throw totais.error;
  if (snapshots.error) throw snapshots.error;

  const totalPorLink = new Map((totais.data ?? []).map((t) => [t.link_id, t]));
  const snapshotPorLink = new Map((snapshots.data ?? []).map((s) => [s.link_id, s]));

  return (links.data ?? []).map((l) => {
    const total = totalPorLink.get(l.id);
    const snapshot = snapshotPorLink.get(l.id);
    const situacao: SituacaoBase = !total
      ? "sem_total"
      : snapshot?.origem === "sync"
        ? "snapshot_real"
        : snapshot?.origem === "base_manual"
          ? "base_manual"
          : "sem_base";
    return {
      linkId: l.id,
      shortUrl: l.short_url,
      filial: l.filial,
      tipo: l.tipo as "vendedor" | "vitrine",
      workspaceSecret: l.workspace_secret,
      linklyLinkId: l.linkly_link_id,
      totalAtual: total ? Number(total.total_cliques) : null,
      totalAtualizadoEm: total?.atualizado_em ?? null,
      situacao,
      baseAtual: snapshot ? Number(snapshot.total) : null,
    };
  });
}

export type ResultadoWorkspace = {
  workspaceSecret: string;
  ok: boolean;
  erro?: string;
  /** Trecho bruto (sem a API key) quando a resposta não foi reconhecida. */
  trechoBruto?: string;
};

export type ResultadoConsultaLinkly = {
  /** link_id (nosso) -> cliques desde o dia 1 segundo o Linkly. */
  cliquesPorLink: Record<string, number>;
  /** Links do workspace que não foram encontrados na resposta da API. */
  naoEncontrados: string[];
  workspaces: ResultadoWorkspace[];
  consultadoEm: string;
};

/**
 * Cliques desde o dia 1 do mês (00:00 São Paulo) até hoje, por link, segundo
 * o Linkly. Por workspace: /workspaces (id), /list_links (casar o id do
 * Linkly com o nosso cadastro, mesma regra da sincronização) e UMA chamada a
 * /clicks/counters/link_id (o limite de 50/h é dos endpoints de analytics).
 */
export async function consultarLinklyDesdeDia1(mes: string, hoje: string): Promise<ResultadoConsultaLinkly> {
  const admin = createAdminClient();
  const links = await carregarLinksParaBase(mes);

  const porWorkspace = new Map<string, LinkParaBase[]>();
  for (const link of links) {
    porWorkspace.set(link.workspaceSecret, [...(porWorkspace.get(link.workspaceSecret) ?? []), link]);
  }

  const resultado: ResultadoConsultaLinkly = {
    cliquesPorLink: {},
    naoEncontrados: [],
    workspaces: [],
    consultadoEm: new Date().toISOString(),
  };

  for (const [workspaceSecret, linksDoWorkspace] of porWorkspace) {
    let apiKey = "";
    try {
      const { data: chave, error: chaveError } = await admin.rpc("obter_linkly_api_key", { p_nome_secret: workspaceSecret });
      if (chaveError || !chave) throw new Error(`Secret "${workspaceSecret}" não encontrado no Vault.`);
      apiKey = chave;

      const respWorkspaces = await fetch(`${LINKLY_API_BASE}/workspaces?api_key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
      if (!respWorkspaces.ok) throw new Error(`GET /workspaces falhou (HTTP ${respWorkspaces.status}).`);
      const workspaceId = extrairWorkspaceId(await respWorkspaces.json());
      if (!workspaceId) throw new Error("Não foi possível identificar o workspace_id em /workspaces.");

      const respLinks = await fetch(
        `${LINKLY_API_BASE}/workspace/${encodeURIComponent(workspaceId)}/list_links?api_key=${encodeURIComponent(apiKey)}`,
        { cache: "no-store" }
      );
      if (!respLinks.ok) throw new Error(`GET /list_links falhou (HTTP ${respLinks.status}).`);
      const linksDaApi = extrairLista(await respLinks.json());

      const respContadores = await fetch(urlContadoresPorLink(workspaceId, apiKey, mes, hoje), { cache: "no-store" });
      const texto = await respContadores.text();
      if (!respContadores.ok) {
        resultado.workspaces.push({
          workspaceSecret,
          ok: false,
          erro: `GET /clicks/counters/link_id falhou (HTTP ${respContadores.status}).`,
          trechoBruto: trechoBrutoSeguro(texto, apiKey),
        });
        continue;
      }

      let json: unknown = null;
      try {
        json = JSON.parse(texto);
      } catch {
        json = null;
      }
      const contagens = extrairContagensPorLink(json);
      if (!contagens) {
        resultado.workspaces.push({
          workspaceSecret,
          ok: false,
          erro: "Resposta de /clicks/counters/link_id em formato não reconhecido — nenhum valor foi usado.",
          trechoBruto: trechoBrutoSeguro(texto, apiKey),
        });
        continue;
      }

      for (const link of linksDoWorkspace) {
        const linkDaApi = encontrarLinkCorrespondente(linksDaApi, link.linklyLinkId, link.shortUrl);
        const idDaApi = linkDaApi ? String(linkDaApi.id ?? linkDaApi.link_id ?? "") : "";
        if (!idDaApi) {
          resultado.naoEncontrados.push(link.linkId);
          continue;
        }
        // Link sem nenhum clique no período não aparece em "values".
        resultado.cliquesPorLink[link.linkId] = contagens.get(idDaApi) ?? 0;
      }
      resultado.workspaces.push({ workspaceSecret, ok: true });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      resultado.workspaces.push({ workspaceSecret, ok: false, erro: apiKey ? trechoBrutoSeguro(mensagem, apiKey) : mensagem });
    }
  }

  return resultado;
}

function diaAnterior(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, 0)).toISOString().slice(0, 10);
}
