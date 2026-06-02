// Limiares de deduplicação fuzzy (R2). Ajustáveis sem mudança de schema.
// Banda forte (entra na fila de confirmação): similaridade de título >= HIGH e mesmo ano.
export const DEDUP_FUZZY_HIGH = 0.92;
