import { requireCurrentUser } from "@/lib/auth/current-user";
import { podeGerarExtratoVendedor } from "@/lib/relatorios/autorizacao";
import { carregarExtratoVendedor } from "@/lib/relatorios/extrato-vendedor";
import { gerarExtratoVendedorExcel } from "@/lib/relatorios/extrato-vendedor-excel";
import { createClient } from "@/lib/supabase/server";

/** Mesma escopo/autorização do extrato em PDF (../route.ts) — só o formato do arquivo muda. */
export async function GET(_request: Request, { params }: { params: Promise<{ vendedorId: string }> }) {
  const usuario = await requireCurrentUser();
  const { vendedorId } = await params;

  const supabase = await createClient();
  const { data: alvo, error } = await supabase
    .from("usuarios")
    .select("id, perfil, filial")
    .eq("id", vendedorId)
    .maybeSingle();
  if (error) throw error;

  if (!alvo || !podeGerarExtratoVendedor(usuario, alvo)) {
    return new Response("Sem permissão para gerar o extrato deste vendedor.", { status: 403 });
  }

  const extrato = await carregarExtratoVendedor(vendedorId);
  if (!extrato) {
    return new Response("Vendedor não encontrado.", { status: 404 });
  }

  const excel = await gerarExtratoVendedorExcel(extrato);
  const nomeArquivo = extrato.vendedorNome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

  return new Response(new Uint8Array(excel), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="extrato-${nomeArquivo}.xlsx"`,
    },
  });
}
