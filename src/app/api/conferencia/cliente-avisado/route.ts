import { autenticar } from "@/lib/conferencia/auth";
import { erro, erroDoBanco, json, lerJson } from "@/lib/conferencia/respostas";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST {reserva} -> cliente_avisado_em/por = agora/usuário, avisar_cliente = false. */
export async function POST(request: Request) {
  const usuario = await autenticar(request);
  if (usuario instanceof Response) return usuario;

  const corpo = await lerJson(request);
  const reserva = typeof corpo?.reserva === "string" || typeof corpo?.reserva === "number" ? String(corpo.reserva).trim() : "";
  if (!reserva) return erro(400, "Informe a reserva.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("conferencia_marcar_cliente_avisado", { p_usuario: usuario.id, p_reserva: reserva });
  if (error) return erroDoBanco("conferencia_marcar_cliente_avisado", error);
  // false = reserva inexistente ou fora do que o usuário enxerga (não distingue, de propósito).
  if (!data) return erro(404, "Reserva não encontrada.");
  return json({ reserva, avisado: true });
}
