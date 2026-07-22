// Lógica pura de descriptografia do envelope de backup (separada do
// wrapper de CLI em descriptografar.mjs só pra poder ser testada
// diretamente — ver descriptografar.test.mjs).
//
// AES-256-GCM: a Edge Function usa Web Crypto (Deno), cujo
// crypto.subtle.encrypt devolve ciphertext e auth tag concatenados (tag =
// últimos 16 bytes). node:crypto trata os dois separadamente
// (decipher.setAuthTag(...)), então é preciso separar isso manualmente
// antes de decifrar aqui.

import { createDecipheriv } from "node:crypto";

const TAMANHO_TAG_BYTES = 16;

/**
 * @param {{versao: number, algoritmo: string, iv: string, ciphertext: string}} envelope
 * @param {string} chaveBase64
 * @returns {Record<string, unknown[]>} as tabelas descriptografadas (casos, implicacoes, ...)
 */
export function descriptografarEnvelope(envelope, chaveBase64) {
  if (envelope.algoritmo !== "AES-256-GCM") {
    throw new Error(`Algoritmo inesperado no envelope: ${envelope.algoritmo}`);
  }

  const chave = Buffer.from(chaveBase64, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const ciphertextComTag = Buffer.from(envelope.ciphertext, "base64");

  const ciphertext = ciphertextComTag.subarray(0, ciphertextComTag.length - TAMANHO_TAG_BYTES);
  const tag = ciphertextComTag.subarray(ciphertextComTag.length - TAMANHO_TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", chave, iv);
  decipher.setAuthTag(tag);

  const textoClaro = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(textoClaro.toString("utf8"));
}
