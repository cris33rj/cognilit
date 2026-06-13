import { NotFound } from "@/components/ai/NotFound";

/**
 * Exibido quando o LLM sinalizou `insufficientData: true` (FR-007).
 * Reutiliza o padrão visual de NotFound com texto específico de síntese.
 */
export function InsufficientData() {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line-strong px-6 py-8 text-center">
      <NotFound what="Dados insuficientes para gerar a síntese" />
      <p className="text-sm text-ink-faint">
        Adicione mais estudos incluídos ou revise os critérios de triagem antes
        de gerar a síntese qualitativa.
      </p>
    </div>
  );
}
