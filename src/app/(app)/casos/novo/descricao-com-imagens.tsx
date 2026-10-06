"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ClipboardPaste, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { imagensDaAreaDeTransferencia } from "@/lib/colar-imagem";
import {
  ANEXO_TAMANHO_MAXIMO_BYTES,
  DESCRICAO_IMAGEM_MIME_TYPES,
  DESCRICAO_IMAGENS_MAXIMO,
} from "@/lib/validation/caso";

type ImagemColada = { id: string; arquivo: File; url: string };

/**
 * Textarea da Descrição que aceita Ctrl+V de imagem (JPG/PNG, até 10 MB,
 * no máximo DESCRICAO_IMAGENS_MAXIMO). A imagem não entra no texto: vira
 * prévia abaixo, removível, e é enviada como "descricaoImagem" num
 * <input type="file"> oculto sincronizado via DataTransfer — mesmo
 * mecanismo de colar de Materiais de apoio (campo-arquivo.tsx). Colar texto
 * segue normal (o evento nunca é cancelado), e qualquer outro tipo colado
 * é ignorado em silêncio.
 */
export function DescricaoComImagens(props: ComponentProps<typeof Textarea>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imagens, setImagens] = useState<ImagemColada[]>([]);
  const [aviso, setAviso] = useState<string | undefined>();

  // Libera as URLs de prévia ao desmontar (remoções liberam a sua na hora).
  const imagensRef = useRef<ImagemColada[]>([]);
  useEffect(() => () => imagensRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  useEffect(() => {
    imagensRef.current = imagens;
    if (!inputRef.current) return;
    const transferencia = new DataTransfer();
    for (const imagem of imagens) transferencia.items.add(imagem.arquivo);
    inputRef.current.files = transferencia.files;
  }, [imagens]);

  const aoColar = (evento: React.ClipboardEvent<HTMLTextAreaElement>) => {
    props.onPaste?.(evento);
    const coladas = imagensDaAreaDeTransferencia(evento.clipboardData, DESCRICAO_IMAGEM_MIME_TYPES);
    if (coladas.length === 0) return;

    const dentroDoLimite = coladas.filter((f) => f.size <= ANEXO_TAMANHO_MAXIMO_BYTES);
    const vagas = Math.max(0, DESCRICAO_IMAGENS_MAXIMO - imagens.length);
    const aceitas = dentroDoLimite.slice(0, vagas);

    if (dentroDoLimite.length < coladas.length) setAviso("Imagem maior que 10 MB não foi adicionada.");
    else if (aceitas.length < dentroDoLimite.length) setAviso(`No máximo ${DESCRICAO_IMAGENS_MAXIMO} imagens na descrição.`);
    else setAviso(undefined);

    if (aceitas.length === 0) return;
    setImagens((atuais) => [
      ...atuais,
      ...aceitas.map((arquivo) => ({ id: crypto.randomUUID(), arquivo, url: URL.createObjectURL(arquivo) })),
    ]);
  };

  const remover = (id: string) => {
    setAviso(undefined);
    setImagens((atuais) => {
      const removida = atuais.find((i) => i.id === id);
      if (removida) URL.revokeObjectURL(removida.url);
      return atuais.filter((i) => i.id !== id);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea {...props} onPaste={aoColar} />
      <input ref={inputRef} type="file" name="descricaoImagem" multiple hidden tabIndex={-1} aria-hidden />
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        <ClipboardPaste className="size-3.5" /> Cole imagens (Ctrl+V) na descrição — JPG ou PNG, até 10 MB cada.
      </p>
      {aviso && <p className="text-destructive text-xs">{aviso}</p>}
      {imagens.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Imagens da descrição">
          {imagens.map((imagem) => (
            <li key={imagem.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não se aplica */}
              <img
                src={imagem.url}
                alt={imagem.arquivo.name}
                className="h-24 w-auto max-w-40 rounded-md border object-contain"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-1 right-1 size-6"
                onClick={() => remover(imagem.id)}
                aria-label={`Remover ${imagem.arquivo.name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
