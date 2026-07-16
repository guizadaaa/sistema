import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export const PERFIL_LABELS: Record<PerfilUsuario, string> = {
  vendedor: "Vendedor",
  gerente: "Gerente",
  adm: "Adm",
  adm_master: "Adm Master",
};

export const FILIAL_LABELS: Record<FilialCvc, string> = {
  "1710": "1710 — Palladium",
  "1714": "1714 — Batel",
  "1730": "1730 — São José",
};
