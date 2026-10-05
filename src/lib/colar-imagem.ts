const EXTENSAO_POR_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

/** Nome estável para imagem vinda da área de transferência (que chega como "image.png" genérico). */
export function nomeImagemColada(mime: string, agora: Date = new Date()): string {
  const carimbo = agora.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return `imagem-colada-${carimbo}.${EXTENSAO_POR_MIME[mime] ?? "png"}`;
}

/**
 * Imagens de um evento de colar, já renomeadas. Só devolve arquivos cujo
 * tipo está em `tiposAceitos` — qualquer outra coisa colada (texto, PDF,
 * GIF...) é ignorada aqui, e o colar de texto segue o caminho normal do
 * navegador.
 */
export function imagensDaAreaDeTransferencia(
  dados: DataTransfer | null | undefined,
  tiposAceitos: readonly string[]
): File[] {
  return Array.from(dados?.files ?? [])
    .filter((f) => tiposAceitos.includes(f.type))
    .map((f, i) => new File([f], nomeImagemColada(f.type, new Date(Date.now() + i * 1000)), { type: f.type }));
}
