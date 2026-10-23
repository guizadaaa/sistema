import { autenticar } from "@/lib/conferencia/auth";
import { erro, erroDoBanco, json, lerJson } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FilialCvc } from "@/lib/supabase/types";

/** POST {loja, data_venda, recibos:[{recibo, numero, cliente, valor, data}]} -> upsert por recibo. */
export async function POST(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const corpo = await lerJson(request);
  if (!corpo) return erro(400, "Corpo JSON inválido.");
  if (!Array.isArray(corpo.recibos)) return erro(400, "recibos deve ser uma lista.");
  if (typeof corpo.loja !== "string" || !usuario.lojas.includes(corpo.loja as FilialCvc)) {
    return erro(403, "Sem acesso a esta loja.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("conferencia_recibos", { p_usuario: usuario.id, p_payload: corpo });
  if (error) return erroDoBanco("conferencia_recibos", error);
  return json(data);
}
