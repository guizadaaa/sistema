import { z } from "zod";

/**
 * Só aceita caminhos relativos internos (começando com uma única "/"), nunca
 * URLs absolutas ou protocol-relative ("//evil.com") — evita open redirect
 * via parâmetro de redirect manipulado num link enviado à vítima.
 */
export const caminhoRedirectSeguro = z
  .string()
  .optional()
  .transform((value) =>
    value && /^\/(?!\/|\\)/.test(value) && !value.includes("://") ? value : undefined
  );
