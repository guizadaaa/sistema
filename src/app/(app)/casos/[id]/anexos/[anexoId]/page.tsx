import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { buscarAnexoHtml } from "@/lib/casos/anexo-html";

/**
 * Visualizador de anexo HTML: a página aparece "como foi salva", num iframe
 * com sandbox vazio (sem allow-scripts e sem allow-same-origin) — nada
 * executa e o conteúdo não alcança a sessão da Aura. O conteúdo vem da rota
 * ./conteudo (limpo, com CSP restritiva).
 */
export default async function AnexoHtmlPage({ params }: { params: Promise<{ id: string; anexoId: string }> }) {
  await requireCurrentUser();
  const { id, anexoId } = await params;
  const anexo = await buscarAnexoHtml(id, anexoId);
  if (!anexo) notFound();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <FileCode className="size-5" /> {anexo.nome}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/casos/${id}`}>
            <ArrowLeft /> Voltar ao caso
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Página salva, mostrada sem scripts nem formulários. Dados de sessão (cookies, tokens) foram removidos no envio.
      </p>
      <iframe
        title={`Anexo ${anexo.nome}`}
        src={`/casos/${id}/anexos/${anexoId}/conteudo`}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-[75vh] w-full rounded-md border bg-white"
        data-testid="anexo-html"
      />
    </div>
  );
}
