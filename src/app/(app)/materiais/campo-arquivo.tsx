"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MATERIAL_APOIO_EXTENSOES_POR_TIPO, type TipoArquivoMaterialApoio } from "@/lib/validation/material-apoio";

const EXTENSAO_POR_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function nomeImagemColada(mime: string): string {
  const agora = new Date();
  const carimbo = agora.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return `imagem-colada-${carimbo}.${EXTENSAO_POR_MIME[mime] ?? "png"}`;
}

/**
 * Input de arquivo que, para tipo Imagem, também aceita Ctrl+V de uma
 * imagem da área de transferência em qualquer ponto do formulário. A imagem
 * colada é injetada no próprio <input type="file"> (via DataTransfer), então
 * o envio continua sendo o FormData normal do form — a server action não
 * distingue arquivo escolhido de arquivo colado. Colar texto num campo de
 * texto segue normal: só intercepta quando o clipboard traz uma imagem.
 */
export function CampoArquivo({
  id,
  tipo,
  label,
  required,
}: {
  id: string;
  tipo: TipoArquivoMaterialApoio;
  label: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; nome: string } | undefined>();
  const aceitaColar = tipo === "imagem";

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    const form = inputRef.current?.closest("form");
    if (!aceitaColar || !form) return;

    const aoColar = (evento: ClipboardEvent) => {
      const imagem = Array.from(evento.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!imagem || !inputRef.current) return;
      evento.preventDefault();

      const arquivo = new File([imagem], nomeImagemColada(imagem.type), { type: imagem.type });
      const transferencia = new DataTransfer();
      transferencia.items.add(arquivo);
      inputRef.current.files = transferencia.files;
      setPreview({ url: URL.createObjectURL(arquivo), nome: arquivo.name });
    };

    form.addEventListener("paste", aoColar);
    return () => form.removeEventListener("paste", aoColar);
  }, [aceitaColar]);

  const aoEscolher = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    setPreview(arquivo && arquivo.type.startsWith("image/") ? { url: URL.createObjectURL(arquivo), nome: arquivo.name } : undefined);
  };

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        name="arquivo"
        type="file"
        accept={MATERIAL_APOIO_EXTENSOES_POR_TIPO[tipo]}
        required={required}
        onChange={aoEscolher}
      />
      {aceitaColar && (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <ClipboardPaste className="size-3.5" /> Ou cole uma imagem (Ctrl+V) em qualquer campo deste formulário.
        </p>
      )}
      {aceitaColar && preview && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: local, next/image não se aplica
        <img src={preview.url} alt={preview.nome} className="mt-1 max-h-40 w-fit rounded-md border object-contain" />
      )}
    </div>
  );
}
