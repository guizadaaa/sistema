"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { CampoMoeda } from "@/components/ui/campo-moeda";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUEM_PAGA_LABELS } from "@/lib/labels";
import { QUEM_PAGA_OPCOES } from "@/lib/validation/implicacao";
import type { Database, QuemPagaMulta } from "@/lib/supabase/types";

import { registrarImplicacao, type RegistrarImplicacaoState } from "./actions";

const initialState: RegistrarImplicacaoState = {};

type ImplicacaoRow = Database["public"]["Tables"]["implicacoes"]["Row"];

export function ImplicacaoForm({
  casoId,
  implicacaoExistente,
}: {
  casoId: string;
  implicacaoExistente: ImplicacaoRow | null;
}) {
  const registrarAction = registrarImplicacao.bind(null, casoId);
  const [state, formAction, isPending] = useActionState(registrarAction, initialState);

  const [quemPaga, setQuemPaga] = useState<QuemPagaMulta>(implicacaoExistente?.quem_paga ?? "cliente");
  const [reducaoComissao, setReducaoComissao] = useState(implicacaoExistente?.reducao_comissao ?? false);
  const [utilizacaoCortesia, setUtilizacaoCortesia] = useState(implicacaoExistente?.utilizacao_cortesia ?? false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{implicacaoExistente ? "Editar implicações financeiras" : "Registrar implicações financeiras"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="multaContratualValor">Multa contratual</Label>
              <CampoMoeda
                id="multaContratualValor"
                name="multaContratualValor"
                required
                defaultValue={implicacaoExistente?.multa_contratual_valor ?? 0}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="multaFornecedorValor">Multa do fornecedor</Label>
              <CampoMoeda
                id="multaFornecedorValor"
                name="multaFornecedorValor"
                required
                defaultValue={implicacaoExistente?.multa_fornecedor_valor ?? 0}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="quemPaga">Quem paga</Label>
            <Select name="quemPaga" required value={quemPaga} onValueChange={(v) => setQuemPaga(v as QuemPagaMulta)}>
              <SelectTrigger id="quemPaga" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUEM_PAGA_OPCOES.map((q) => (
                  <SelectItem key={q} value={q}>
                    {QUEM_PAGA_LABELS[q]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {quemPaga === "vendedor" && (
            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reducaoMarkup"
                  name="reducaoMarkup"
                  defaultChecked={implicacaoExistente?.reducao_markup ?? false}
                />
                <Label htmlFor="reducaoMarkup" className="font-normal">
                  Redução de markup
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="reducaoComissao"
                  name="reducaoComissao"
                  checked={reducaoComissao}
                  onCheckedChange={(v) => setReducaoComissao(v === true)}
                />
                <Label htmlFor="reducaoComissao" className="font-normal">
                  Redução de comissão
                </Label>
              </div>
              {reducaoComissao && (
                <div className="flex flex-col gap-2 pl-6">
                  <Label htmlFor="reducaoComissaoValor">Valor da redução de comissão</Label>
                  <CampoMoeda
                    id="reducaoComissaoValor"
                    name="reducaoComissaoValor"
                    required
                    className="w-48"
                    defaultValue={implicacaoExistente?.reducao_comissao_valor ?? undefined}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="utilizacaoCortesia"
                  name="utilizacaoCortesia"
                  checked={utilizacaoCortesia}
                  onCheckedChange={(v) => setUtilizacaoCortesia(v === true)}
                />
                <Label htmlFor="utilizacaoCortesia" className="font-normal">
                  Utilização de cortesia
                </Label>
              </div>
              {utilizacaoCortesia && (
                <div className="flex flex-col gap-2 pl-6">
                  <Label htmlFor="utilizacaoCortesiaValor">Valor da cortesia utilizada</Label>
                  <CampoMoeda
                    id="utilizacaoCortesiaValor"
                    name="utilizacaoCortesiaValor"
                    required
                    className="w-48"
                    defaultValue={implicacaoExistente?.utilizacao_cortesia_valor ?? undefined}
                  />
                </div>
              )}
            </div>
          )}

          {state.error && <p className="text-destructive text-sm">{state.error}</p>}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Salvando..." : implicacaoExistente ? "Salvar alterações" : "Registrar implicações"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
