import { autenticar } from "@/lib/conferencia/auth";
import { erro, erroDoBanco, json, lerJson } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FilialCvc } from "@/lib/supabase/types";

/**
 * POST excursões confirmadas de uma loja. Toda a gravação (clientes,
 * cliente_excursoes, eventos de voo, nomes novos no mapeamento) acontece em
 * conferencia_sync() numa transação — ver 20261023000002_clientes_conferencia.sql.
 * Qualquer usuário autenticado grava, desde que a loja do corpo esteja nas
 * lojas dele. logins_gravacao (config) só orienta a extensão sobre quem grava
 * no Systur — não autoriza nada aqui. login_systur só é registrado na reserva.
 */
export async function POST(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const corpo = await lerJson(request);
  if (!corpo) return erro(400, "Corpo JSON inválido.");
  if (!Array.isArray(corpo.excursoes)) return erro(400, "excursoes deve ser uma lista.");
  if (typeof corpo.loja !== "string" || !usuario.lojas.includes(corpo.loja as FilialCvc)) {
    return erro(403, "Sem acesso a esta loja.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("conferencia_sync", { p_usuario: usuario.id, p_payload: corpo });
  if (error) return erroDoBanco("conferencia_sync", error);
  return json(data);
}
