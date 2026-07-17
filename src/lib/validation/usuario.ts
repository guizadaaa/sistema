import { z } from "zod";

import type { FilialCvc, PerfilUsuario } from "@/lib/supabase/types";

export const PERFIS_USUARIO: readonly PerfilUsuario[] = ["vendedor", "gerente", "adm", "adm_master"];
export const FILIAIS_USUARIO: readonly FilialCvc[] = ["1710", "1714", "1730"];

// Espelha a constraint usuarios_filial_por_perfil (schema.sql): filial
// obrigatória para vendedor/gerente, e deve ficar vazia para adm/adm_master.
function comFilialPorPerfil<T extends { perfil: PerfilUsuario; filial?: FilialCvc | null }>(
  schema: z.ZodType<T>
) {
  return schema.refine(
    (v) =>
      (["vendedor", "gerente"].includes(v.perfil) && !!v.filial) ||
      (["adm", "adm_master"].includes(v.perfil) && !v.filial),
    {
      message: "Filial obrigatória para vendedor/gerente e deve ficar vazia para adm/adm_master",
      path: ["filial"],
    }
  );
}

export const convidarUsuarioSchema = comFilialPorPerfil(
  z.object({
    nomeCompleto: z.string().trim().min(1, "Informe o nome completo"),
    email: z.string().trim().email("E-mail inválido"),
    perfil: z.enum(PERFIS_USUARIO as [PerfilUsuario, ...PerfilUsuario[]]),
    filial: z.enum(FILIAIS_USUARIO as [FilialCvc, ...FilialCvc[]]).nullish(),
  })
);

export const atualizarUsuarioSchema = comFilialPorPerfil(
  z.object({
    perfil: z.enum(PERFIS_USUARIO as [PerfilUsuario, ...PerfilUsuario[]]),
    filial: z.enum(FILIAIS_USUARIO as [FilialCvc, ...FilialCvc[]]).nullable(),
    ativo: z.boolean(),
  })
);
