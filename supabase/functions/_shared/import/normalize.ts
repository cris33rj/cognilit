/** Normaliza DOI para chave de dedup exata (R2). */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const v = doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .trim();
  return v.length > 0 ? v : null;
}

/** Normaliza título para chave de dedup exata/fuzzy (R2). */
export function normalizeTitle(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const v = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // diacríticos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
  return v.length > 0 ? v : null;
}
