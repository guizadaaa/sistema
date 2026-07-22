"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iniciarConfiguracaoMfa, verificarCodigoMfa, type ConfirmarMfaState } from "@/app/mfa/actions";

import { removerFatorMfa } from "./actions";

const initialState: ConfirmarMfaState = {};

type FatorTotp = { id: string; created_at: string };

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function RemoverFatorBotao({ factorId }: { factorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | undefined>();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setErro(undefined);
            const resultado = await removerFatorMfa(factorId);
            if (resultado.error) setErro(resultado.error);
          })
        }
      >
        {isPending ? "Removendo..." : "Remover"}
      </Button>
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  );
}

type DadosEnroll = { qrCode: string; secret: string; factorId: string };

function AdicionarFator({ onCancelar }: { onCancelar: () => void }) {
  const [dados, setDados] = useState<DadosEnroll | undefined>();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | undefined>();

  const verificarAction = verificarCodigoMfa.bind(null, dados?.factorId ?? "", "/seguranca");
  const [state, formAction, isVerifyPending] = useActionState(verificarAction, initialState);

  if (!dados) {
    const iniciar = () => {
      setErro(undefined);
      startTransition(async () => {
        const resultado = await iniciarConfiguracaoMfa();
        if (resultado.error || !resultado.qrCode || !resultado.secret || !resultado.factorId) {
          setErro(resultado.error ?? "Não foi possível iniciar a configuração.");
          return;
        }
        setDados({ qrCode: resultado.qrCode, secret: resultado.secret, factorId: resultado.factorId });
      });
    };

    return (
      <div className="flex flex-col gap-3 border-t pt-4">
        {erro && <p className="text-destructive text-sm">{erro}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={iniciar} disabled={isPending}>
            {isPending ? "Gerando..." : "Gerar QR code"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI do Supabase, não um asset estático */}
      <img
        src={`data:image/svg+xml;utf-8,${encodeURIComponent(dados.qrCode)}`}
        alt="QR code para configurar o autenticador"
        width={180}
        height={180}
      />
      <div className="flex flex-col gap-1">
        <Label>Não conseguiu escanear? Digite o código manualmente:</Label>
        <code className="bg-muted rounded-md border px-2 py-1 text-sm break-all">{dados.secret}</code>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="codigo">Código do app autenticador</Label>
          <Input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            required
            className="w-32"
          />
        </div>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isVerifyPending}>
            {isVerifyPending ? "Confirmando..." : "Confirmar e ativar"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

export function SegurancaMfa({ fatores, obrigatorio }: { fatores: FatorTotp[]; obrigatorio: boolean }) {
  const [adicionando, setAdicionando] = useState(false);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Autenticação em duas etapas (2FA)</CardTitle>
        <CardDescription>
          {obrigatorio
            ? "Obrigatório para o seu perfil. Cadastre um segundo app autenticador como backup, caso perca acesso ao principal."
            : "Opcional para o seu perfil — ative por conta própria se quiser uma camada extra de proteção no login."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fatores.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum app autenticador cadastrado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fatores.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="text-sm">Autenticador cadastrado em {formatarData(f.created_at)}</span>
                <RemoverFatorBotao factorId={f.id} />
              </li>
            ))}
          </ul>
        )}

        {adicionando ? (
          <AdicionarFator onCancelar={() => setAdicionando(false)} />
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setAdicionando(true)}>
            Adicionar app autenticador
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
