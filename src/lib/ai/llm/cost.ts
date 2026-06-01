import type { CostEstimate } from "./types";

// Heurística do Marco 1 (refinada na Fatia 5 com métricas reais).
const TOKENS_PER_ITEM = 800;
const USD_PER_1K_TOKENS = 0.0025;

export function estimateScreeningCost(itemCount: number): CostEstimate {
  const tokensEstimated = Math.max(0, Math.trunc(itemCount)) * TOKENS_PER_ITEM;
  return {
    tokensEstimated,
    cost: { usd: (tokensEstimated / 1000) * USD_PER_1K_TOKENS },
  };
}
