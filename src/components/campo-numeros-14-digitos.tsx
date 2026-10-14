"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { somenteDigitos } from "@/lib/validation/cpf";

function erroNumero(valor: string, rotulo: string): string | undefined {
  if (valor.length === 0) return `Informe o número do ${rotulo.toLowerCase()} ou remova esta linha`;
  if (valor.length < 14) return `${rotulo} deve ter exatamente 14 números`;
  return undefined;
}

/**
 * Lista de números de 14 dígitos (uma linha por número, todas com o mesmo
 * `name`) — mesma UX das linhas de contrato adicional. A validação usa
 * setCustomValidity, então o próprio form recusa o envio enquanto houver
 * linha inválida, sem o pai precisar acompanhar o estado das linhas.
 */
export function CampoNumeros14Digitos({
  name,
  titulo,
  rotulo,
  textoBotao,
}: {
  /** Nome dos inputs no FormData (formData.getAll(name)). */
  name: string;
  titulo: string;
  /** Rótulo do número, usado em placeholder e mensagens ("Recibo"). */
  rotulo: string;
  textoBotao: string;
}) {
  const idBase = useId();
  const [linhas, setLinhas] = useState<{ id: string; valor: string }[]>([]);

  const adicionar = () => setLinhas((prev) => [...prev, { id: `${idBase}-${Date.now()}-${prev.length}`, valor: "" }]);
  const remover = (id: string) => setLinhas((prev) => prev.filter((l) => l.id !== id));
  const alterar = (id: string, valor: string) =>
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, valor } : l)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{titulo}</Label>
        <Button type="button" variant="outline" size="sm" onClick={adicionar}>
          <Plus /> {textoBotao}
        </Button>
      </div>

      {linhas.map((linha) => {
        const erro = erroNumero(linha.valor, rotulo);
        return (
          <div key={linha.id} className="grid grid-cols-[1fr_auto] items-start gap-2">
            <div className="flex flex-col gap-1">
              <Input
                inputMode="numeric"
                maxLength={14}
                name={name}
                placeholder={`Número do ${rotulo.toLowerCase()}`}
                value={linha.valor}
                aria-invalid={Boolean(erro)}
                ref={(el) => el?.setCustomValidity(erro ?? "")}
                onChange={(e) => alterar(linha.id, somenteDigitos(e.target.value).slice(0, 14))}
              />
              {erro && linha.valor.length > 0 && <p className="text-destructive text-sm">{erro}</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover ${rotulo.toLowerCase()}`}
              onClick={() => remover(linha.id)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
