// Sincronização de cliques do Linkly (item de divulgação/vendedor, 28/07):
// lê linkly_links, agrupa por workspace (workspace_secret = nome do secret no
// Vault com a API key daquele workspace/conta Linkly) e atualiza
// linkly_cliques_totais com o total de cliques atual de cada link.
//
// Disparada por pg_cron via a procedure disparar_sincronizacao_linkly()
// (net.http_post) OU diretamente pelo botão "Atualizar agora" (Adm/Adm
// Master), que chama esta função via supabase-js .functions.invoke() com a
// service_role_key já disponível no servidor Next.js — ver
// src/lib/linkly/sincronizar.ts. Nunca chamada pelo browser.
//
// A lógica de parsing/correspondência (workspace, links, contagem de
// cliques) mora em ./matching.ts — isolada ali especificamente pra poder ser
// testada com vitest (matching.test.ts) a partir do Node normal, já que este
// arquivo importa "jsr:..." e roda só sob o runtime do Deno.
//
// ATUALIZAÇÃO (28/07, pós primeiro teste manual real): os nomes de campo
// abaixo foram confirmados contra uma resposta REAL da API (capturada pelo
// usuário via net.http_get direto no SQL Editor, workspace 1710) — não são
// mais suposição da documentação pública. Ver o comentário no topo de
// matching.ts para o que mudou (clicks_total, full_url, slug sempre null).

import { createClient } from "jsr:@supabase/supabase-js@2";

import { encontrarLinkCorrespondente, extrairContagemDeCliques, extrairLista, extrairWorkspaceId } from "./matching.ts";

const LINKLY_API_BASE = "https://app.linklyhq.com/api/v1";

type LinklyLinkRow = {
  id: string;
  workspace_secret: string;
  linkly_link_id: string;
  short_url: string;
};

type ResultadoSincronizacao = {
  ok: boolean;
  atualizados: { link_id: string; linkly_link_id: string; total_cliques: number }[];
  erros: { escopo: string; mensagem: string }[];
};

async function buscarWorkspaceId(apiKey: string): Promise<string> {
  const resp = await fetch(`${LINKLY_API_BASE}/workspaces?api_key=${encodeURIComponent(apiKey)}`);
  if (!resp.ok) throw new Error(`GET /workspaces falhou (HTTP ${resp.status}): ${await resp.text()}`);
  const workspaceId = extrairWorkspaceId(await resp.json());
  if (!workspaceId) throw new Error("Não foi possível identificar o workspace_id na resposta de /workspaces.");
  return workspaceId;
}

async function buscarLinks(workspaceId: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const resp = await fetch(
    `${LINKLY_API_BASE}/workspace/${encodeURIComponent(workspaceId)}/list_links?api_key=${encodeURIComponent(apiKey)}`
  );
  if (!resp.ok) throw new Error(`GET /list_links falhou (HTTP ${resp.status}): ${await resp.text()}`);
  return extrairLista(await resp.json());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const resultado: ResultadoSincronizacao = { ok: true, atualizados: [], erros: [] };

  try {
    const { data: linksData, error: linksError } = await supabase
      .from("linkly_links")
      .select("id, workspace_secret, linkly_link_id, short_url");
    if (linksError) throw new Error(`Falha ao ler linkly_links: ${linksError.message}`);

    const links = (linksData ?? []) as LinklyLinkRow[];
    const porWorkspace = new Map<string, LinklyLinkRow[]>();
    for (const link of links) {
      const grupo = porWorkspace.get(link.workspace_secret) ?? [];
      grupo.push(link);
      porWorkspace.set(link.workspace_secret, grupo);
    }

    for (const [workspaceSecret, linksDoWorkspace] of porWorkspace) {
      try {
        const { data: apiKey, error: apiKeyError } = await supabase.rpc("obter_linkly_api_key", {
          p_nome_secret: workspaceSecret,
        });
        if (apiKeyError || !apiKey) {
          throw new Error(`Secret "${workspaceSecret}" não encontrado no Vault: ${apiKeyError?.message ?? "vazio"}`);
        }

        const workspaceId = await buscarWorkspaceId(apiKey as string);
        const linksDaApi = await buscarLinks(workspaceId, apiKey as string);

        for (const linkRow of linksDoWorkspace) {
          const linkDaApi = encontrarLinkCorrespondente(linksDaApi, linkRow.linkly_link_id, linkRow.short_url);
          if (!linkDaApi) {
            resultado.erros.push({
              escopo: `${workspaceSecret}/${linkRow.linkly_link_id}`,
              mensagem: "Link não encontrado na resposta da API do Linkly (nem por id, nem por URL curta).",
            });
            continue;
          }

          const cliques = extrairContagemDeCliques(linkDaApi);
          if (cliques === null) {
            resultado.erros.push({
              escopo: `${workspaceSecret}/${linkRow.linkly_link_id}`,
              mensagem: `Nenhum campo de contagem de cliques reconhecido. Campos disponíveis: ${Object.keys(linkDaApi).join(", ")}`,
            });
            continue;
          }

          const { error: upsertError } = await supabase
            .from("linkly_cliques_totais")
            .upsert({ link_id: linkRow.id, total_cliques: cliques, atualizado_em: new Date().toISOString() }, { onConflict: "link_id" });
          if (upsertError) throw new Error(`Falha ao gravar linkly_cliques_totais (${linkRow.id}): ${upsertError.message}`);

          resultado.atualizados.push({ link_id: linkRow.id, linkly_link_id: linkRow.linkly_link_id, total_cliques: cliques });
        }
      } catch (erroWorkspace) {
        resultado.erros.push({ escopo: workspaceSecret, mensagem: String(erroWorkspace) });
      }
    }

    resultado.ok = resultado.erros.length === 0;

    return new Response(JSON.stringify(resultado), {
      status: resultado.ok ? 200 : 207,
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro na sincronização do Linkly:", erro);
    return new Response(JSON.stringify({ ok: false, erro: String(erro) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
