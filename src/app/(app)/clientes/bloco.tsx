"use client";

import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * Um bloco da página que falha sozinho: o erro de uma consulta (ex.: timeout)
 * mostra o aviso só aqui e o resto da página segue funcionando. O link
 * recarrega a página inteira.
 */
export class Bloco extends Component<{ nome: string; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(erro: unknown) {
    console.error(`Erro no bloco "${this.props.nome}" da base de clientes:`, erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <p
        role="alert"
        data-testid={`erro-${this.props.nome}`}
        className="text-muted-foreground flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-sm"
      >
        <TriangleAlert className="size-4" />
        Não foi possível carregar esta parte — tente de novo.
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            window.location.reload();
          }}
          className="text-foreground underline underline-offset-2"
        >
          Recarregar a página
        </a>
      </p>
    );
  }
}
