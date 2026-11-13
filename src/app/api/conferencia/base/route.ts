import { autenticar } from "@/lib/conferencia/auth";
import { comTiposServico, LIMITE_RESERVAS_BASE } from "@/lib/conferencia/base";
import { erro, erroDoBanco, json, lerJson } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILIAIS } from "@/lib/validation/caso";

/**
 * POST da coleta da base de clientes pelo bot da extensão (só adm_master).
 * Até 200 reservas por chamada; idempotente (upsert por reserva e por
 * reserva × contratante). tipos_servico é calculado aqui
 * (src/lib/clientes/tipos-servico.ts) e a gravação inteira acontece em
 * conferencia_base() numa transação — ver 20261113000001_base_clientes.sql.
 */
export async function POST(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;
  if (usuario.papel !== "adm_master") return erro(403, "Só o adm_master envia a coleta da base.");

  const corpo = await lerJson(request);
  if (!corpo) return erro(400, "Corpo JSON inválido.");
  if (typeof corpo.loja !== "string" || !(FILIAIS as readonly string[]).includes(corpo.loja)) {
    return erro(400, "Loja inválida.");
  }
  if (!Array.isArray(corpo.reservas)) return erro(400, "reservas deve ser uma lista.");
  if (corpo.reservas.length > LIMITE_RESERVAS_BASE) {
    return erro(413, `No máximo ${LIMITE_RESERVAS_BASE} reservas por chamada.`);
  }
  if (corpo.reservas.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
    return erro(400, "Cada reserva deve ser um objeto.");
  }

  const payload = { ...corpo, reservas: (corpo.reservas as Record<string, unknown>[]).map(comTiposServico) };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("conferencia_base", { p_usuario: usuario.id, p_payload: payload });
  if (error) return erroDoBanco("conferencia_base", error);
  return json(data);
}
