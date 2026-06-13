"use client";

import { useState } from "react";
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";

interface EstimateResult {
  ok: true;
  itemCount: number;
  estimate: { tokensEstimated: number; cost: Record<string, number> };
  byokMissing: boolean;
}

interface SynthesisRunnerProps {
  reviewId: string;
  candidateCount: number;
  onEstimate: (
    reviewId: string,
  ) => Promise<EstimateResult | { ok: false; error?: string }>;
  onRun: (reviewId: string) => Promise<{ ok: boolean; error?: string }>;
}

type Phase = "idle" | "estimated" | "running" | "done" | "error";

/**
 * Botão "Gerar síntese" com estimativa de custo + confirmação antes de rodar.
 * Reusa AsyncActionButton para o spinner/pending nativo.
 * FR-006: mostra custo estimado e aviso de BYOK ausente antes de confirmar.
 */
export function SynthesisRunner({
  reviewId,
  candidateCount,
  onEstimate,
  onRun,
}: SynthesisRunnerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEstimate() {
    setError(null);
    const result = await onEstimate(reviewId);
    if (!result.ok) {
      setError(
        (result as { ok: false; error?: string }).error ?? "Falha ao estimar.",
      );
      setPhase("error");
      return;
    }
    setEstimate(result as EstimateResult);
    setPhase("estimated");
  }

  async function handleRun() {
    setPhase("running");
    setError(null);
    const result = await onRun(reviewId);
    if (!result.ok) {
      setError(result.error ?? "Falha ao gerar síntese.");
      setPhase("error");
    } else {
      setPhase("done");
    }
  }

  if (phase === "done") {
    return (
      <p className="text-sm text-done" role="status">
        Síntese gerada com sucesso. Aguarde a atualização da página.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Fase idle: botão de estimativa */}
      {phase === "idle" && (
        <AsyncActionButton
          onRun={handleEstimate}
          idleLabel="Gerar síntese"
          pendingLabel="Estimando…"
          className="rounded border border-accent px-3 py-1.5 text-sm text-accent focus-visible:ring"
        />
      )}

      {/* Fase estimated: mostra custo e confirmação */}
      {phase === "estimated" && estimate && (
        <div className="rounded border border-accent-wash bg-accent-wash p-3 space-y-2">
          <p className="text-sm font-medium text-ink">
            Estimativa para {estimate.itemCount} estudo
            {estimate.itemCount !== 1 ? "s" : ""}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 text-xs text-ink-soft">
            <dt>Tokens estimados</dt>
            <dd>{estimate.estimate.tokensEstimated.toLocaleString("pt-BR")}</dd>
            {Object.entries(estimate.estimate.cost).map(([k, v]) => (
              <>
                <dt key={`dt-${k}`}>{k}</dt>
                <dd key={`dd-${k}`}>
                  {typeof v === "number" ? v.toFixed(4) : String(v)}
                </dd>
              </>
            ))}
          </dl>

          {estimate.byokMissing && (
            <p
              className="rounded border border-warn bg-warn-wash px-2 py-1 text-xs text-warn"
              role="alert"
            >
              Chave BYOK não cadastrada — síntese usará o modelo demonstrativo
              (sem custo real).
            </p>
          )}

          <p className="text-xs text-ink-faint">
            {candidateCount} estudo{candidateCount !== 1 ? "s" : ""} elegível
            {candidateCount !== 1 ? "s" : ""} encontrado
            {candidateCount !== 1 ? "s" : ""}.
          </p>

          <div className="flex gap-2">
            <AsyncActionButton
              onRun={handleRun}
              idleLabel="Confirmar e gerar"
              pendingLabel="Gerando síntese…"
              className="rounded border border-accent bg-accent px-3 py-1 text-xs text-white focus-visible:ring"
            />
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setEstimate(null);
              }}
              className="rounded border border-line px-3 py-1 text-xs text-ink-faint focus-visible:ring"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Fase error */}
      {phase === "error" && error && (
        <div className="space-y-2">
          <p className="text-xs text-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setError(null);
            }}
            className="text-xs text-ink-soft underline focus-visible:ring"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
