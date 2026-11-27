"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { comprimirImagem } from "@/lib/comprimir-imagem";
import { mimeDoAnexo } from "@/lib/casos/anexo-tipo";
import { ANEXO_ACCEPT, ANEXO_COMENTARIO_MAXIMO, ANEXO_FORMATOS_TEXTO, ANEXO_TAMANHO_MAXIMO_BYTES } from "@/lib/validation/caso";

export function validarArquivoAnexo(arquivo: File): string | undefined {
  if (!mimeDoAnexo(arquivo.name, arquivo.type)) {
    return `Formato não permitido (só ${ANEXO_FORMATOS_TEXTO})`;
  }
  if (arquivo.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
    return "Arquivo maior que 10 MB";
  }
  return undefined;
}

/**
 * Linha de anexo (arquivo · categoria · comentário · remover). Num container
 * largo fica tudo lado a lado; estreito, o comentário desce para a linha de
 * baixo. O pai precisa ter a classe `@container`.
 */
export const CLASSE_LINHA_ANEXO =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 @xl:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]";

/**
 * Comentário opcional do anexo — enviado como "anexoComentario", na mesma
 * posição do "anexoArquivo"/"anexoTipo" da linha (lib/casos/anexos.ts).
 */
export function CampoComentarioAnexo() {
  return (
    <div className="order-last col-span-2 @xl:order-none @xl:col-span-1">
      <Input
        name="anexoComentario"
        maxLength={ANEXO_COMENTARIO_MAXIMO}
        placeholder="Comentário (opcional)"
        aria-label="Comentário do anexo (opcional)"
        data-testid="anexo-comentario"
      />
    </div>
  );
}

/** Coloca `arquivo` dentro do <input type="file"> (o envio continua sendo o FormData do form). */
export function definirArquivoNoInput(input: HTMLInputElement | null, arquivo: File) {
  if (!input) return;
  const transferencia = new DataTransfer();
  transferencia.items.add(arquivo);
  input.files = transferencia.files;
}

/**
 * Prévia da imagem do anexo (blob: local). `arquivo` pode ser imagem ou
 * não; para PDF não mostra nada.
 */
export function PreviaAnexo({ arquivo }: { arquivo: File | undefined }) {
  const url = useMemo(() => (arquivo?.type.startsWith("image/") ? URL.createObjectURL(arquivo) : undefined), [arquivo]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não se aplica
  return <img src={url} alt={arquivo?.name ?? "Prévia"} className="h-20 w-auto max-w-40 rounded-md border object-contain" />;
}

/**
 * "Escolher arquivo" de anexo (nome anexoArquivo): imagem escolhida é
 * comprimida no navegador (WebP, lado maior até 2000 px — só se ficar menor)
 * e substitui o arquivo do próprio input; PDF e HTML vão como estão (o HTML é
 * limpo no servidor).
 */
export function CampoArquivoAnexo({ onErro }: { onErro: (erro: string | undefined) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | undefined>();
  const [comprimindo, setComprimindo] = useState(false);

  const aoEscolher = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const escolhido = evento.target.files?.[0];
    if (!escolhido) {
      setArquivo(undefined);
      return onErro(undefined);
    }
    setComprimindo(true);
    const final = await comprimirImagem(escolhido);
    setComprimindo(false);
    if (final !== escolhido) definirArquivoNoInput(inputRef.current, final);
    setArquivo(final);
    onErro(validarArquivoAnexo(final));
  };

  return (
    <div className="flex flex-col gap-1">
      <Input ref={inputRef} type="file" name="anexoArquivo" accept={ANEXO_ACCEPT} onChange={aoEscolher} />
      <span className="text-muted-foreground text-xs">{ANEXO_FORMATOS_TEXTO}, até 10 MB.</span>
      {comprimindo && <span className="text-muted-foreground text-xs">Otimizando imagem...</span>}
      <PreviaAnexo arquivo={arquivo} />
    </div>
  );
}
