import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  buscarClientesBase,
  listarFiltrosSalvos,
  listarJanelasColeta,
  listarModelosMensagem,
  listarVendedoresBase,
  POR_PAGINA,
} from "@/lib/clientes/base";
import { lerFiltros } from "@/lib/clientes/base-util";
import type { FilialCvc } from "@/lib/supabase/types";
import { FILIAIS } from "@/lib/validation/caso";

import { BaseClientesTela } from "./base-clientes-tela";

/**
 * Aba Clientes → Base de clientes. Quem vê: todo usuário ativo vê os clientes
 * e compras da própria loja; adm/adm_master as 3 (pode_ver_loja no banco).
 * Busca, campanha e paginação rodam em base_clientes_buscar().
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

  const [clientes, vendedores, modelos, salvos, janelas] = await Promise.all([
    buscarClientesBase(filtros, pagina),
    listarVendedoresBase(),
    listarModelosMensagem(),
    listarFiltrosSalvos(),
    ehAdmMaster ? listarJanelasColeta() : Promise.resolve(null),
  ]);

  return (
    <BaseClientesTela
      filtros={filtros}
      pagina={pagina}
      porPagina={POR_PAGINA}
      clientes={clientes}
      lojas={lojas}
      vendedores={vendedores}
      modelos={modelos}
      salvos={salvos}
      janelas={janelas}
      podeEditarModelos={ehAdmin}
    />
  );
}
