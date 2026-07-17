import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Client com a service_role key — bypassa RLS e dá acesso à Admin API do
 * Auth (auth.admin.*). Nunca importar isto num Client Component nem expor a
 * key para o browser; só usar em Server Actions que já checaram
 * explicitamente o perfil do chamador (a Admin API não passa pelas policies
 * de public.usuarios).
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
