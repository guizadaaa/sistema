// Health check do Render (render.yaml: healthCheckPath). Só diz que o
// servidor Node está de pé: não toca no banco nem no Supabase Auth, e o
// proxy (src/proxy.ts) não roda aqui.
export const dynamic = "force-static";

export function GET() {
  return Response.json({ ok: true });
}
