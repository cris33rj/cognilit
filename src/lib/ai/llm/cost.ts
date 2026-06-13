import type { CostEstimate } from "./types";

// Heurística do Marco 1 (refinada na Fatia 5 com métricas reais).
const TOKENS_PER_ITEM = 800;
export const USD_PER_1K_TOKENS = 0.0025;

export function estimateScreeningCost(itemCount: number): CostEstimate {
  const tokensEstimated = Math.max(0, Math.trunc(itemCount)) * TOKENS_PER_ITEM;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}

const TOKENS_PER_FIELD = 250; // heurística (refinar na Fatia 5 com métricas reais)

/** Estimativa de custo de extração: itens (estudos) × campos. */
export function estimateExtractionCost(
  itemCount: number,
  fieldCount: number,
): CostEstimate {
  const items = Math.max(0, Math.trunc(itemCount));
  const fields = Math.max(0, Math.trunc(fieldCount));
  const tokensEstimated = items * fields * TOKENS_PER_FIELD;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}

// itemCount = número de ESTUDOS (registros candidatos) incluídos na síntese.
const TOKENS_PER_STUDY_SYNTHESIS = 1200; // heurística (refinar com métricas reais)

/** Estimativa de custo de síntese: ~1 passe agregando os achados de N estudos. */
export function estimateSynthesisCost(itemCount: number): CostEstimate {
  const items = Math.max(0, Math.trunc(itemCount));
  const tokensEstimated = items * TOKENS_PER_STUDY_SYNTHESIS;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}
