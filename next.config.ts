import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions usam 1 MB por padrão. O formulário de novo caso aceita
      // até 3 anexos de até 10 MB cada (ver ANEXO_TAMANHO_MAXIMO_BYTES) no
      // mesmo envio — sem esse ajuste, qualquer anexo próximo do limite
      // padrão faz a requisição inteira ser rejeitada antes mesmo de chegar
      // ao server action, o que o Next.js expõe como falha genérica de rede
      // no navegador em vez de um erro tratado pela aplicação.
      bodySizeLimit: "35mb",
    },
  },
};

export default nextConfig;
