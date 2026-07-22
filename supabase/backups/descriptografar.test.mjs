import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { descriptografarEnvelope } from "./descriptografar-core.mjs";

// Simula exatamente o que supabase/functions/backup-dados-sensiveis/index.ts
// produz via Web Crypto (Deno): ciphertext + auth tag (16 bytes)
// concatenados num único buffer — é essa concatenação que o script de
// restauração (Node) precisa saber desfazer, já que node:crypto trata o tag
// como um valor separado (decipher.setAuthTag). Este teste existe
// justamente porque não dá pra rodar a Edge Function de verdade neste
// ambiente (sem Deno, sem projeto Supabase real) — é a validação mais
// próxima possível de que o formato do envelope é compatível ponta a ponta.
function criptografarComoWebCrypto(chave, iv, dadosClaros) {
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const ciphertext = Buffer.concat([cipher.update(dadosClaros), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, tag]); // mesma ordem que crypto.subtle.encrypt devolve
}

describe("descriptografarEnvelope", () => {
  it("reverte corretamente um envelope no formato produzido pela Edge Function (Web Crypto)", () => {
    const chave = randomBytes(32);
    const iv = randomBytes(12);
    const tabelas = {
      casos: [{ id: "c1", cliente_cpf: "11144477735" }],
      implicacoes: [],
      desfechos: [{ id: "d1", banco_cpf: "52998224725" }],
      usuarios: [{ id: "u1", nome_completo: "Vendedor Um" }],
      status_historico: [{ id: "s1", status: "resolvido" }],
    };

    const dadosClaros = Buffer.from(JSON.stringify(tabelas), "utf8");
    const ciphertextComTag = criptografarComoWebCrypto(chave, iv, dadosClaros);

    const envelope = {
      versao: 1,
      geradoEm: "2026-07-23T03:00:00.000Z",
      algoritmo: "AES-256-GCM",
      iv: iv.toString("base64"),
      ciphertext: ciphertextComTag.toString("base64"),
      contagens: { casos: 1, implicacoes: 0, desfechos: 1, usuarios: 1, status_historico: 1 },
    };

    const resultado = descriptografarEnvelope(envelope, chave.toString("base64"));

    expect(resultado).toEqual(tabelas);
  });

  it("rejeita algoritmo inesperado (defesa contra formato de envelope errado/futuro)", () => {
    expect(() => descriptografarEnvelope({ algoritmo: "AES-128-CBC" }, "qualquer")).toThrow(/Algoritmo inesperado/);
  });

  it("falha (auth tag inválido) se a chave estiver errada — GCM detecta adulteração/chave incorreta", () => {
    const chave = randomBytes(32);
    const chaveErrada = randomBytes(32);
    const iv = randomBytes(12);
    const ciphertextComTag = criptografarComoWebCrypto(chave, iv, Buffer.from("{}"));

    const envelope = {
      algoritmo: "AES-256-GCM",
      iv: iv.toString("base64"),
      ciphertext: ciphertextComTag.toString("base64"),
    };

    expect(() => descriptografarEnvelope(envelope, chaveErrada.toString("base64"))).toThrow();
  });
});
