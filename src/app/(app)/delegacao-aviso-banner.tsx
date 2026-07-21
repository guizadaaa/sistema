import { diasAteInicio } from "@/lib/delegacoes/status";

/**
 * Item 5 (aviso de delegação agendada): recalculado a cada carregamento de
 * página, sem estado persistido — some sozinho quando a delegação começa
 * (deixa de satisfazer precisaAvisoDelegacaoAgendada) ou é cancelada.
 */
export function DelegacaoAvisoBanner({ inicio }: { inicio: string }) {
  const dias = diasAteInicio(inicio);
  const dataFormatada = new Date(inicio).toLocaleDateString("pt-BR");

  const quando =
    dias <= 0
      ? "hoje"
      : dias === 1
        ? "amanhã"
        : `em ${dias} dias`;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
      Sua delegação de responsabilidades administrativas começa {quando} ({dataFormatada}) — prepare-se para
      conduzir o fluxo adm da sua filial enquanto ela estiver ativa.
    </div>
  );
}
