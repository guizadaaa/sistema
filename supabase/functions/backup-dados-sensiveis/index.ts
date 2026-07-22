// Backup semanal criptografado (item 6, backlog de 22/07): exporta casos,
// implicacoes, desfechos, usuarios e status_historico, criptografa com
// AES-256-GCM (chave em vault.decrypted_secrets, lida via a função
// obter_backup_encryption_key — só service_role pode chamar) e sobe pro
// bucket privado "backups". Também apaga backups além da retenção
// configurada (RETENCAO_BACKUPS).
//
// Disparada por pg_cron via net.http_post (ver
// supabase/migrations/20260723000004_backup_dados_sensiveis.sql) — nunca
// chamada pelo app nem por um usuário. O agendamento do pg_cron em si não
// está incluído nessa migration; ver supabase/backups/RESTAURACAO.md para o
// passo a passo de ativação e para o processo de restauração.
//
// Formato do arquivo (envelope), consumido por supabase/backups/descriptografar.mjs:
//   { versao, geradoEm, algoritmo: "AES-256-GCM", iv (base64), ciphertext (base64), contagens }
// `ciphertext` inclui os 16 bytes finais do auth tag do GCM concatenados —
// comportamento padrão do retorno de crypto.subtle.encrypt (Web Crypto);
// quem descriptografar via node:crypto precisa separar isso manualmente
// (node:crypto trata o tag à parte, ver descriptografar.mjs).

import { createClient } from "jsr:@supabase/supabase-js@2";

const TABELAS_BACKUP = ["casos", "implicacoes", "desfechos", "usuarios", "status_historico"] as const;
const RETENCAO_BACKUPS = 8;
const BUCKET = "backups";

function base64ParaUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function uint8ArrayParaBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

async function criptografar(chaveBase64: string, dados: Uint8Array): Promise<{ iv: string; ciphertext: string }> {
  const chaveBytes = base64ParaUint8Array(chaveBase64);
  const chave = await crypto.subtle.importKey("raw", chaveBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados);

  return {
    iv: uint8ArrayParaBase64(iv),
    ciphertext: uint8ArrayParaBase64(new Uint8Array(ciphertextBuffer)),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const contagens: Record<string, number> = {};
    const tabelas: Record<string, unknown[]> = {};

    for (const tabela of TABELAS_BACKUP) {
      const { data, error } = await supabase.from(tabela).select("*");
      if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
      tabelas[tabela] = data ?? [];
      contagens[tabela] = (data ?? []).length;
    }

    const { data: chaveBase64, error: chaveError } = await supabase.rpc("obter_backup_encryption_key");
    if (chaveError || !chaveBase64) {
      throw new Error(`Falha ao obter chave de criptografia: ${chaveError?.message ?? "chave não configurada no Vault"}`);
    }

    const payload = new TextEncoder().encode(JSON.stringify(tabelas));
    const { iv, ciphertext } = await criptografar(chaveBase64 as string, payload);

    const geradoEm = new Date().toISOString();
    const envelope = {
      versao: 1,
      geradoEm,
      algoritmo: "AES-256-GCM",
      iv,
      ciphertext,
      contagens,
    };

    const nomeArquivo = `backup-${geradoEm.replace(/[:.]/g, "-")}.json`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(nomeArquivo, JSON.stringify(envelope), { contentType: "application/json" });
    if (uploadError) throw new Error(`Falha ao subir backup: ${uploadError.message}`);

    // Retenção: mantém só os RETENCAO_BACKUPS mais recentes — nome
    // prefixado por data ISO ordena cronologicamente em ordem alfabética.
    const { data: arquivos, error: listError } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
    if (listError) throw new Error(`Falha ao listar backups existentes: ${listError.message}`);

    const antigos = (arquivos ?? [])
      .map((a) => a.name)
      .sort()
      .slice(0, -RETENCAO_BACKUPS);

    if (antigos.length > 0) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(antigos);
      if (removeError) throw new Error(`Falha ao limpar backups antigos: ${removeError.message}`);
    }

    return new Response(JSON.stringify({ ok: true, arquivo: nomeArquivo, contagens, removidos: antigos }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro no backup de dados sensíveis:", erro);
    return new Response(JSON.stringify({ ok: false, erro: String(erro) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
