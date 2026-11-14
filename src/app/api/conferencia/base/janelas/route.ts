import { autenticar } from "@/lib/conferencia/auth";
import { erro, json } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILIAIS } from "@/lib/validation/caso";

/** GET ?loja=1710 -> {janelas: [{loja, de, ate, reservas, coletado_em}]} (adm_master), para o bot continuar de onde parou. */
export async function GET(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;
  if (usuario.papel !== "adm_master") return erro(403, "Só o adm_master consulta a coleta da base.");

  const loja = new URL(request.url).searchParams.get("loja");
  if (loja !== null && !(FILIAIS as readonly string[]).includes(loja)) return erro(400, "Loja inválida.");

  const admin = createAdminClient();
  let consulta = admin
    .from("base_coleta_janelas")
    .select("loja, de, ate, reservas, coletado_em")
    .order("loja")
    .order("de");
  if (loja) consulta = consulta.eq("loja", loja as (typeof FILIAIS)[number]);
  const { data, error } = await consulta;
  if (error) {
    console.error("Erro ao listar janelas da base:", error);
    return erro(500, "Erro ao consultar as janelas.");
  }
  return json({ janelas: data ?? [] });
}
