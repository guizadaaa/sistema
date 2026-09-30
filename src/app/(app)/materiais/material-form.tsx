"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoriaMaterialApoio, MaterialApoio } from "@/lib/materiais-apoio/listar";
import {
  TIPO_MATERIAL_APOIO_LABELS,
  TIPOS_ARQUIVO_MATERIAL_APOIO,
  ehTipoArquivoMaterialApoio,
  type TipoArquivoMaterialApoio,
} from "@/lib/validation/material-apoio";

import { editarMaterialApoio, enviarMaterialApoio, type MaterialApoioFormState } from "./actions";
import { CampoArquivo } from "./campo-arquivo";

const initialState: MaterialApoioFormState = {};

function CampoCategoria({ id, categorias, padrao }: { id: string; categorias: CategoriaMaterialApoio[]; padrao?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>Categoria</Label>
      <Select name="categoria_id" defaultValue={padrao ?? "sem-categoria"}>
        <SelectTrigger id={id} className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sem-categoria">Sem categoria</SelectItem>
          {categorias.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CampoTipoArquivo({
  id,
  tipo,
  onChange,
}: {
  id: string;
  tipo: TipoArquivoMaterialApoio;
  onChange: (tipo: TipoArquivoMaterialApoio) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>Tipo</Label>
      <Select name="tipo" value={tipo} onValueChange={(v) => ehTipoArquivoMaterialApoio(v) && onChange(v)}>
        <SelectTrigger id={id} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIPOS_ARQUIVO_MATERIAL_APOIO.map((t) => (
            <SelectItem key={t} value={t}>
              {TIPO_MATERIAL_APOIO_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function NovoMaterialForm({ categorias }: { categorias: CategoriaMaterialApoio[] }) {
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [tipo, setTipo] = useState<TipoArquivoMaterialApoio>("pdf");
  // Incrementa a cada envio bem-sucedido pra remontar o form limpo (inclusive o input de arquivo).
  const [versao, setVersao] = useState(0);

  const [state, formAction, isPending] = useActionState(async (prev: MaterialApoioFormState, formData: FormData) => {
    const resultado = await enviarMaterialApoio(prev, formData);
    if (resultado.ok) setVersao((v) => v + 1);
    return resultado;
  }, initialState);

  return (
    <form key={versao} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="modo" value={modo} />

      <div className="flex w-fit rounded-md border p-0.5" role="group" aria-label="Arquivo ou link">
        {(["arquivo", "link"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={modo === m ? "default" : "ghost"}
            aria-pressed={modo === m}
            onClick={() => setModo(m)}
          >
            {m === "arquivo" ? "Arquivo" : "Link"}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="novo-titulo">Título</Label>
        <Input id="novo-titulo" name="titulo" placeholder="Ex.: Manual de atendimento ao cliente" required />
      </div>

      <CampoCategoria id="novo-categoria" categorias={categorias} />

      {modo === "arquivo" ? (
        <>
          <CampoTipoArquivo id="novo-tipo" tipo={tipo} onChange={setTipo} />
          <CampoArquivo key={tipo} id="novo-arquivo" tipo={tipo} label="Arquivo" required />
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="novo-url">Link</Label>
          <Input id="novo-url" name="url" type="url" placeholder="https://..." required />
        </div>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Enviando..." : "Enviar material"}
      </Button>
    </form>
  );
}

export function EditarMaterialDialog({
  material,
  categorias,
  aberto,
  onOpenChange,
}: {
  material: MaterialApoio;
  categorias: CategoriaMaterialApoio[];
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const ehLink = material.tipo === "link";
  const [tipo, setTipo] = useState<TipoArquivoMaterialApoio>(ehTipoArquivoMaterialApoio(material.tipo) ? material.tipo : "pdf");

  const [state, formAction, isPending] = useActionState(async (prev: MaterialApoioFormState, formData: FormData) => {
    const resultado = await editarMaterialApoio(prev, formData);
    if (resultado.ok) onOpenChange(false);
    return resultado;
  }, initialState);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar material</DialogTitle>
          <DialogDescription>
            {ehLink
              ? "Altere título, categoria ou o link."
              : "Altere título ou categoria. Para substituir o arquivo, escolha um novo — o anterior é apagado."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={material.id} />

          <div className="flex flex-col gap-1">
            <Label htmlFor={`editar-titulo-${material.id}`}>Título</Label>
            <Input id={`editar-titulo-${material.id}`} name="titulo" defaultValue={material.titulo} required />
          </div>

          <CampoCategoria id={`editar-categoria-${material.id}`} categorias={categorias} padrao={material.categoria_id} />

          {ehLink ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`editar-url-${material.id}`}>Link</Label>
              <Input id={`editar-url-${material.id}`} name="url" type="url" defaultValue={material.url ?? ""} required />
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">Arquivo atual: {material.nome_arquivo}</p>
              <CampoTipoArquivo id={`editar-tipo-${material.id}`} tipo={tipo} onChange={setTipo} />
              <CampoArquivo
                key={tipo}
                id={`editar-arquivo-${material.id}`}
                tipo={tipo}
                label="Substituir arquivo (opcional)"
              />
            </>
          )}

          {state.error && <p className="text-destructive text-sm">{state.error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
