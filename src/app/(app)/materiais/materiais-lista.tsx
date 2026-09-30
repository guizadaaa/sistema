"use client";

import { useMemo, useState, useTransition } from "react";
import { FileSpreadsheet, FileText, Image as ImageIcon, Link as LinkIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoriaMaterialApoio, MaterialApoio } from "@/lib/materiais-apoio/listar";
import type { TipoMaterialApoio } from "@/lib/supabase/types";
import { TIPO_MATERIAL_APOIO_LABELS } from "@/lib/validation/material-apoio";

import { excluirMaterialApoio, gerarUrlAssinadaMaterialApoio } from "./actions";
import { CategoriasSecao } from "./categorias-secao";
import { EditarMaterialDialog, NovoMaterialForm } from "./material-form";

const ICONE_POR_TIPO: Record<TipoMaterialApoio, LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  imagem: ImageIcon,
  xlsx: FileSpreadsheet,
  link: LinkIcon,
};

const TODOS = "todos";
const SEM_CATEGORIA = "sem-categoria";

function BotaoAbrir({ material }: { material: MaterialApoio }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  if (material.tipo === "link" && material.url) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={material.url} target="_blank" rel="noopener noreferrer">
          Abrir
        </a>
      </Button>
    );
  }

  const baixar = async () => {
    if (!material.storage_path) return;
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

function AcoesAdmin({ material, categorias }: { material: MaterialApoio; categorias: CategoriaMaterialApoio[] }) {
  const [editando, setEditando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [excluindo, startExclusao] = useTransition();

  const excluir = () => {
    setErro(undefined);
    startExclusao(async () => {
      const resultado = await excluirMaterialApoio(material.id);
      if (resultado.error) setErro(resultado.error);
      else setConfirmandoExclusao(false);
    });
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
        Editar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmandoExclusao(true)}>
        Excluir
      </Button>

      {editando && (
        <EditarMaterialDialog material={material} categorias={categorias} aberto={editando} onOpenChange={setEditando} />
      )}

      <Dialog open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir &ldquo;{material.titulo}&rdquo;?</DialogTitle>
            <DialogDescription>
              {material.tipo === "link"
                ? "O link sai da lista para todos os perfis."
                : "O registro e o arquivo são apagados definitivamente para todos os perfis."}
            </DialogDescription>
          </DialogHeader>
          {erro && <p className="text-destructive text-sm">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmandoExclusao(false)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluir} disabled={excluindo}>
              {excluindo ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function descricaoOrigem(material: MaterialApoio): string {
  if (material.tipo !== "link") return material.nome_arquivo ?? "";
  try {
    return new URL(material.url ?? "").host;
  } catch {
    return material.url ?? "";
  }
}

export function MateriaisApoioLista({
  materiais,
  categorias,
  ehAdmin,
  ehAdmMaster,
}: {
  materiais: MaterialApoio[];
  categorias: CategoriaMaterialApoio[];
  ehAdmin: boolean;
  ehAdmMaster: boolean;
}) {
  const [filtroTipo, setFiltroTipo] = useState<string>(TODOS);
  const [filtroCategoria, setFiltroCategoria] = useState<string>(TODOS);

  const nomeCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const tiposPresentes = useMemo(
    () => (Object.keys(TIPO_MATERIAL_APOIO_LABELS) as TipoMaterialApoio[]).filter((t) => materiais.some((m) => m.tipo === t)),
    [materiais]
  );

  const filtrados = materiais.filter((m) => {
    if (filtroTipo !== TODOS && m.tipo !== filtroTipo) return false;
    if (filtroCategoria === SEM_CATEGORIA) return m.categoria_id === null;
    if (filtroCategoria !== TODOS) return m.categoria_id === filtroCategoria;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Documentos e materiais de apoio</h1>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {materiais.length > 0 && (
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="filtro-tipo">Tipo</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger id="filtro-tipo" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {tiposPresentes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_MATERIAL_APOIO_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="filtro-categoria">Categoria</Label>
                <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                  <SelectTrigger id="filtro-categoria" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todas</SelectItem>
                    <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {materiais.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum documento enviado ainda.</p>
          ) : filtrados.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum material com esses filtros.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtrados.map((m) => {
                const Icone = ICONE_POR_TIPO[m.tipo];
                const categoria = m.categoria_id ? nomeCategoria.get(m.categoria_id) : undefined;
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icone className="text-muted-foreground size-4 shrink-0" aria-label={TIPO_MATERIAL_APOIO_LABELS[m.tipo]} />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">{m.titulo}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {[categoria, descricaoOrigem(m), new Date(m.enviado_em).toLocaleDateString("pt-BR")]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ehAdmin && <AcoesAdmin material={m} categorias={categorias} />}
                      <BotaoAbrir material={m} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar novo material</CardTitle>
          </CardHeader>
          <CardContent>
            <NovoMaterialForm categorias={categorias} />
          </CardContent>
        </Card>
      )}

      {ehAdmMaster && <CategoriasSecao categorias={categorias} />}
    </div>
  );
}
