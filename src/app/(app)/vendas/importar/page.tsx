import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { listarFeriados, paraFeriado } from "@/lib/feriados/listar";
import { hojeSaoPaulo } from "@/lib/linkly/mes";
import { listarHistoricoCalendario, listarImportacoesCalendario } from "@/lib/vendas/importacoes";
import { FILIAIS } from "@/lib/validation/caso";

import { VendasTabs } from "../vendas-tabs";
import { CalendarioImportacoes } from "./calendario-importacoes";
import { ImportarForm } from "./importar-form";

export default async function ImportarVendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await requireCurrentUser();
  const ehAdmin = usuario.perfil === "adm" || usuario.perfil === "adm_master";

  // Importar é só adm/adm_master (vendas_importadas_insert exige
  // auth_is_admin()); gerente entra só pra ver o calendário da própria loja
  // (vendas_importacoes_calendario filtra).
  if (!ehAdmin && usuario.perfil !== "gerente") {
    redirect("/vendas");
  }

  const sp = await searchParams;
  const hoje = hojeSaoPaulo();
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const de = `${mes}-01`;
  const ate = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const lojas: string[] = ehAdmin ? [...FILIAIS] : usuario.filial ? [usuario.filial] : [];

  const [feriados, importacoes, historicos] = await Promise.all([
    listarFeriados(de, ate),
    listarImportacoesCalendario(de, ate),
    listarHistoricoCalendario(de, ate),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <VendasTabs ativo="importar" perfil={usuario.perfil} />
      {ehAdmin && <ImportarForm />}
      <CalendarioImportacoes
        mes={mes}
        hoje={hoje}
        lojas={lojas}
        feriados={feriados.map(paraFeriado)}
        importacoes={importacoes}
        historicos={historicos}
      />
    </div>
  );
}
