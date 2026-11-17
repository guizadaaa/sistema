import { Suspense } from "react";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  buscarClientesBase,
  contarNomesParecemAtivos,
  listarFiltrosSalvos,
  listarModelosMensagem,
  listarOpcoesVendedor,
  POR_PAGINA,
} from "@/lib/clientes/base";
import { lerFiltros, type FiltrosBase } from "@/lib/clientes/base-util";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

import {
  buscarComprasCliente,
  buscarSugestoesDestino,
  carregarCoberturaBase,
  excluirFiltroCliente,
  salvarFiltroCliente,
} from "./actions";
import { AvisoVinculo } from "./aviso-vinculo";
import { Bloco } from "./bloco";
import { CoberturaBase } from "./cobertura-base";
import { FiltrosBaseClientes } from "./filtros-base";
import { ListaClientes } from "./lista-clientes";
import { ModelosMensagem } from "./modelos-mensagem";

/**
 * Aba Clientes → Base de clientes. Quem vê: todo usuário ativo vê os clientes
 * e compras da própria loja; adm/adm_master as 3 (_lojas_visiveis no banco).
 *
 * Cada bloco (aviso, filtros, lista, cobertura) busca os próprios dados em
 * Suspense e tem o próprio limite de erro: uma consulta que falha (ex.:
 * timeout) derruba só aquele bloco, nunca a página inteira. A cobertura só
 * consulta o banco quando o adm_master a expande.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const sp = await searchParams;
  const filtros = lerFiltros(sp);
  const pagina = Math.max(1, Number.parseInt(typeof sp.pagina === "string" ? sp.pagina : "1", 10) || 1);

  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";
  const ehAdmMaster = usuario.perfil === "adm_master";
  const lojas: FilialCvc[] = ehAdmin ? [...FILIAIS] : usuario.filial ? [usuario.filial] : [];
  // Nova busca = novo carregamento da lista (mostra o esqueleto).
  const chaveLista = JSON.stringify({ filtros, pagina });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Base de clientes</h1>
          {ehAdmin && (
            <Bloco nome="modelos">
              <Suspense fallback={null}>
                <ModelosBloco />
              </Suspense>
            </Bloco>
          )}
        </div>
        {ehAdmin && (
          <Bloco nome="aviso">
            <Suspense fallback={null}>
              <AvisoBloco />
            </Suspense>
          </Bloco>
        )}
      </div>

      <Bloco nome="filtros">
        <Suspense fallback={<Esqueleto altura="h-44" rotulo="Carregando filtros..." />}>
          <FiltrosBloco filtros={filtros} lojas={lojas} />
        </Suspense>
      </Bloco>

      <Bloco nome="lista">
        <Suspense key={chaveLista} fallback={<Esqueleto altura="h-96" rotulo="Buscando clientes..." />}>
          <ListaBloco filtros={filtros} pagina={pagina} />
        </Suspense>
      </Bloco>

      {ehAdmMaster && (
        <Bloco nome="cobertura">
          <CoberturaBase carregar={carregarCoberturaBase} />
        </Bloco>
      )}
    </div>
  );
}

function Esqueleto({ altura, rotulo }: { altura: string; rotulo: string }) {
  return (
    <div className={`bg-muted/40 text-muted-foreground flex ${altura} animate-pulse items-start rounded-xl border p-6 text-sm`}>
      {rotulo}
    </div>
  );
}

async function ModelosBloco() {
  return <ModelosMensagem modelos={await listarModelosMensagem()} />;
}

async function AvisoBloco() {
  return <AvisoVinculo quantidade={await contarNomesParecemAtivos()} />;
}

async function FiltrosBloco({ filtros, lojas }: { filtros: FiltrosBase; lojas: FilialCvc[] }) {
  const [opcoesVendedor, salvos] = await Promise.all([listarOpcoesVendedor(), listarFiltrosSalvos()]);
  return (
    <FiltrosBaseClientes
      filtros={filtros}
      lojas={lojas}
      opcoesVendedor={opcoesVendedor}
      salvos={salvos}
      acoes={{ buscarSugestoesDestino, salvarFiltroCliente, excluirFiltroCliente }}
    />
  );
}

async function ListaBloco({ filtros, pagina }: { filtros: FiltrosBase; pagina: number }) {
  const [clientes, modelos] = await Promise.all([buscarClientesBase(filtros, pagina), listarModelosMensagem()]);
  return (
    <ListaClientes
      clientes={clientes}
      filtros={filtros}
      pagina={pagina}
      porPagina={POR_PAGINA}
      modelos={modelos}
      acoes={{ buscarComprasCliente }}
    />
  );
}
