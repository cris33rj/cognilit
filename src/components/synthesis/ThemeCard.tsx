"use client";

import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { SuggestionActions } from "@/components/ai/SuggestionActions";
import { NarrativeEditor } from "./NarrativeEditor";
import { GroundingRefs } from "./GroundingRefs";
import { SummaryTable } from "./SummaryTable";
import type { SuggestionState, Provenance } from "@/lib/ai/llm/types";
import type { ThemeSummaryTable } from "@/lib/synthesis/summary-table";

interface ThemeFinding {
  extraction_value_id: string;
  order: number;
}

export interface ThemeCardTheme {
  id: string;
  name: string;
  narrative: string;
  state: SuggestionState;
  order: number;
  summary_table: ThemeSummaryTable | null;
  theme_finding: ThemeFinding[];
  provenance: Provenance;
}

interface ThemeCardProps {
  reviewId: string;
  synthesisId: string;
  theme: ThemeCardTheme;
  onAccept: (
    reviewId: string,
    themeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onEdit: (
    reviewId: string,
    themeId: string,
    patch: { name?: string; narrative?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  onReject: (
    reviewId: string,
    themeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onReorder?: (
    reviewId: string,
    synthesisId: string,
    themeIds: string[],
  ) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Cartão de um tema sintetizado: nome, narrativa, estado, ações de ratificação,
 * refs de grounding e tabela resumo estudos×campos.
 */
export function ThemeCard({
  reviewId,
  synthesisId: _synthesisId,
  theme,
  onAccept,
  onEdit,
  onReject,
}: ThemeCardProps) {
  const isResolved = theme.state === "accepted" || theme.state === "rejected";

  return (
    <article className="rounded border border-line bg-canvas p-4 space-y-3">
      {/* Header: nome + chip de estado */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{theme.name}</h3>
        <SuggestionChip state={theme.state} />
      </div>

      {/* Narrativa editável */}
      <NarrativeEditor
        reviewId={reviewId}
        themeId={theme.id}
        initialNarrative={theme.narrative}
        onSave={(rId, tId, patch) => onEdit(rId, tId, patch)}
      />

      {/* Ações de ratificação — ocultas quando já resolvido */}
      {!isResolved && (
        <SuggestionActions
          onAccept={() => onAccept(reviewId, theme.id)}
          onEdit={() =>
            onEdit(reviewId, theme.id, { narrative: theme.narrative })
          }
          onReject={() => onReject(reviewId, theme.id)}
        />
      )}

      {/* Refs de grounding */}
      {theme.theme_finding.length > 0 && (
        <GroundingRefs
          findings={theme.theme_finding}
          provenance={theme.provenance}
        />
      )}

      {/* Tabela resumo */}
      {theme.summary_table && <SummaryTable table={theme.summary_table} />}
    </article>
  );
}
