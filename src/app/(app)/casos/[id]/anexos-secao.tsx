"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANEXO_TIPO_LABELS } from "@/lib/labels";
import { ANEXO_MIME_TYPES, ANEXO_TAMANHO_MAXIMO_BYTES, ANEXO_TIPOS_DOCUMENTO } from "@/lib/validation/caso";
import type { Database } from "@/lib/supabase/types";

import { enviarAnexoAoCaso, gerarUrlAssinadaAnexo, type EnviarAnexoState } from "./actions";

type AnexoRow = Database["public"]["Tables"]["anexos"]["Row"];

function validarArquivoAnexo(arquivo: File): string | undefined {
  if (!(ANEXO_MIME_TYPES as readonly string[]).includes(arquivo.type)) {
    return "Formato não permitido (só PDF, JPG ou PNG)";
  }
  if (arquivo.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
    return "Arquivo maior que 10 MB";
  }
  return undefined;
}

function BotaoDownload({ anexo }: { anexo: AnexoRow }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const baixar = async () => {
    setCarregando(true);
    setErro(undefined);
    const resultado = await gerarUrlAssinadaAnexo(anexo.id, anexo.storage_path);
    setCarregando(false);
    if (resultado.error || !resultado.url) {
      setErro(resultado.error ?? "Erro ao gerar link");
      return;
    }
    window.open(resultado.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={baixar} disabled={carregando}>
        {carregando ? "Gerando link..." : "Baixar"}
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  );
}

const initialState: EnviarAnexoState = {};

export function AnexosSecao({ casoId, anexos }: { casoId: string; anexos: AnexoRow[] }) {
  const enviarAnexoAction = enviarAnexoAoCaso.bind(null, casoId);
  const [state, formAction, isPending] = useActionState(enviarAnexoAction, initialState);
  const [rows, setRows] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string | undefined>>({});

  const adicionarRow = () => setRows((prev) => [...prev, `${prev.length}-${Date.now()}`]);
  const removerRow = (rowId: string) => {
    setRows((prev) => prev.filter((id) => id !== rowId));
    setErros((prev) => {
      const { [rowId]: _removido, ...resto } = prev;
      return resto;
    });
  };

  const bloquearSeInvalido = (event: React.FormEvent<HTMLFormElement>) => {
    if (Object.values(erros).some(Boolean)) {
      event.preventDefault();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anexos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {anexos.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum anexo enviado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {anexos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.nome_arquivo}</span>
                  <span className="text-muted-foreground text-xs">
                    {ANEXO_TIPO_LABELS[a.tipo_documento]} · {new Date(a.enviado_em).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <BotaoDownload anexo={a} />
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} onSubmit={bloquearSeInvalido} className="flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Adicionar anexo</span>
            <Button type="button" variant="outline" size="sm" onClick={adicionarRow}>
              <Plus /> Adicionar
            </Button>
          </div>

          {rows.map((rowId) => (
            <div key={rowId} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
              <div className="flex flex-col gap-1">
                <Input
                  type="file"
                  name="anexoArquivo"
                  accept={ANEXO_MIME_TYPES.join(",")}
                  aria-invalid={Boolean(erros[rowId])}
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    setErros((prev) => ({ ...prev, [rowId]: arquivo ? validarArquivoAnexo(arquivo) : undefined }));
                  }}
                />
                {erros[rowId] && <p className="text-destructive text-sm">{erros[rowId]}</p>}
              </div>
              <Select name="anexoTipo" defaultValue="outro">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANEXO_TIPOS_DOCUMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ANEXO_TIPO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="icon" aria-label="Remover anexo" onClick={() => removerRow(rowId)}>
                <Trash2 />
              </Button>
            </div>
          ))}

          {rows.length > 0 && (
            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Enviando..." : "Enviar anexos"}
            </Button>
          )}

          {state.avisos && (
            <ul className="text-destructive list-disc pl-4 text-sm">
              {state.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
