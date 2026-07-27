"use client";

import { useActionState, useState } from "react";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MATERIAL_APOIO_MIME_TYPES } from "@/lib/validation/material-apoio";
import type { MaterialApoio } from "@/lib/materiais-apoio/listar";

import { enviarMaterialApoio, gerarUrlAssinadaMaterialApoio, type EnviarMaterialApoioState } from "./actions";

function BotaoDownload({ material }: { material: MaterialApoio }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const baixar = async () => {
    setCarregando(true);
    setErro(undefined);
    const resultado = await gerarUrlAssinadaMaterialApoio(material.storage_path);
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

const initialState: EnviarMaterialApoioState = {};

export function MateriaisApoioLista({ materiais, ehAdmin }: { materiais: MaterialApoio[]; ehAdmin: boolean }) {
  const [state, formAction, isPending] = useActionState(enviarMaterialApoio, initialState);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Documentos e materiais de apoio</h1>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          {materiais.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum documento enviado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {materiais.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{m.titulo}</span>
                      <span className="text-muted-foreground text-xs">
                        {m.nome_arquivo} · {new Date(m.enviado_em).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <BotaoDownload material={m} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar novo documento</CardTitle>
          </CardHeader>
          <CardContent>
            <form key={materiais.length} action={formAction} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="titulo">Título</Label>
                <Input id="titulo" name="titulo" placeholder="Ex.: Manual de atendimento ao cliente" required />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="arquivo">Arquivo (PDF)</Label>
                <Input id="arquivo" name="arquivo" type="file" accept={MATERIAL_APOIO_MIME_TYPES.join(",")} required />
              </div>

              {state.error && <p className="text-destructive text-sm">{state.error}</p>}

              <Button type="submit" disabled={isPending} className="w-fit">
                {isPending ? "Enviando..." : "Enviar documento"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
