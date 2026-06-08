/**
 * Compõe um seed editável de string de busca a partir de termos derivados por IA
 * (FR-007 / kind='search_term'). NÃO é a query booleana final — é ponto de partida
 * que o pesquisador edita por base. Termos alternativos ⇒ unidos por " OR ".
 */
export function composeSuggestedQuery(terms: string[]): string {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const t of terms) {
    const v = t.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    cleaned.push(v);
  }
  return cleaned.join(" OR ");
}
