import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { caminhoRedirectSeguro } from "@/lib/validation/redirect-path";

import { ConfirmForm } from "./confirm-form";

const TIPOS_SUPORTADOS: readonly string[] = ["invite", "recovery"];

/**
 * GET só renderiza — nenhum efeito colateral, seguro para ser pré-buscado
 * por crawlers de prévia de link. A confirmação de verdade (verifyOtp)
 * acontece só no POST disparado pelo botão, em actions.ts.
 */
export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash : undefined;
  const type = typeof sp.type === "string" && TIPOS_SUPORTADOS.includes(sp.type) ? sp.type : undefined;
  const next = caminhoRedirectSeguro.parse(typeof sp.next === "string" ? sp.next : undefined) ?? "/";

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Confirmar acesso</CardTitle>
          <CardDescription>Clique no botão abaixo para continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmForm tokenHash={tokenHash} type={type} next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
