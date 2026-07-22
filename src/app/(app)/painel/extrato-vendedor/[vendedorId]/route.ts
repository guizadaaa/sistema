import { requireCurrentUser } from "@/lib/auth/current-user";
import { podeGerarExtratoVendedor } from "@/lib/relatorios/autorizacao";
import { carregarExtratoVendedor } from "@/lib/relatorios/extrato-vendedor";
import { gerarExtratoVendedorPdf } from "@/lib/relatorios/extrato-vendedor-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Escopo (item 4 do backlog de 22/07): vendedor só o próprio extrato;
 * gerente só vendedor da própria filial; adm/adm_master sem restrição —
 * ver podeGerarExtratoVendedor. O SELECT do alvo já roda sob a RLS normal
 * de usuarios (usuarios_select_self/usuarios_select_filial_gerente), que
 * sozinha já impediria a maioria dos casos negados (a linha nem viria);
 * a checagem explícita é o que transforma isso num 403 claro em vez de um
 * "vendedor não encontrado" confuso.
 */
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

  const pdf = await gerarExtratoVendedorPdf(extrato);
  const nomeArquivo = extrato.vendedorNome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="extrato-${nomeArquivo}.pdf"`,
    },
  });
}
