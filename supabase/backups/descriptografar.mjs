#!/usr/bin/env node
// Descriptografa um arquivo de backup gerado por
// supabase/functions/backup-dados-sensiveis. Passo 4 de RESTAURACAO.md.
//
// Uso: node descriptografar.mjs <arquivo-backup.json> <chave-base64>
//
// A chave vem do Vault do Supabase (SQL Editor do dashboard, como
// owner/admin do projeto — não é self-service pelo app):
//   select decrypted_secret from vault.decrypted_secrets where name = 'backup_encryption_key';

import { readFileSync, writeFileSync } from "node:fs";

import { descriptografarEnvelope } from "./descriptografar-core.mjs";

function main() {
  const [, , caminhoArquivo, chaveBase64] = process.argv;
  if (!caminhoArquivo || !chaveBase64) {
    console.error("Uso: node descriptografar.mjs <arquivo-backup.json> <chave-base64>");
    process.exitCode = 1;
    return;
  }

  const envelope = JSON.parse(readFileSync(caminhoArquivo, "utf8"));
  const dados = descriptografarEnvelope(envelope, chaveBase64);

  console.log(`Backup gerado em: ${envelope.geradoEm}`);
  console.log(`Contagens no momento do backup: ${JSON.stringify(envelope.contagens, null, 2)}`);

  const caminhoSaida = caminhoArquivo.replace(/\.json$/, "") + ".descriptografado.json";
  writeFileSync(caminhoSaida, JSON.stringify(dados, null, 2));
  console.log(`Dados descriptografados salvos em: ${caminhoSaida}`);
}

main();
