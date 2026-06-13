import { createClient } from "@/lib/supabase/server";
import {
  loadSynthesis,
  countSynthesisCandidates,
} from "@/lib/synthesis/queries";
import { ThemeList } from "@/components/synthesis/ThemeList";
import { SynthesisRunner } from "@/components/synthesis/SynthesisRunner";
import { InsufficientData } from "@/components/synthesis/InsufficientData";
import type { ThemeCardTheme } from "@/components/synthesis/ThemeCard";
import type { SuggestionState } from "@/lib/ai/llm/types";
import type { ThemeSummaryTable } from "@/lib/synthesis/summary-table";
import {
  estimateSynthesis,
  runSynthesis,
  acceptTheme,
  editTheme,
  rejectTheme,
  reorderThemes,
  mergeThemes,
  splitTheme,
} from "./actions";

// Sentinel provenance used when DB rows pre-date the provenance column or
// the field is absent. ThemeCard renders provenance for grounding display only —
// a missing provenance is not a blocking error.
const UNKNOWN_PROVENANCE = {
  model: "unknown",
  version: "unknown",
  prompt_or_span: "",
  timestamp: "",
} as const;

export default async function SynthesisPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const supabase = await createClient();

  const [data, candidateCount] = await Promise.all([
    loadSynthesis({ supabase }, reviewId),
    countSynthesisCandidates({ supabase }, reviewId),
  ]);

  // Map ThemeRow[] → ThemeCardTheme[]:
  // • state: cast string → SuggestionState (DB enforces the enum)
  // • summary_table: cast unknown → ThemeSummaryTable | null
  // • provenance: provide sentinel (field not persisted in ThemeRow)
  const mappedThemes: ThemeCardTheme[] =
    data?.themes.map((t) => ({
      id: t.id,
      name: t.name,
      narrative: t.narrative,
      order: t.order,
      state: t.state as SuggestionState,
      summary_table: (t.summary_table as ThemeSummaryTable | null) ?? null,
      theme_finding: t.theme_finding,
      provenance: UNKNOWN_PROVENANCE,
    })) ?? [];

  const hasThemes = data !== null && mappedThemes.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Síntese qualitativa</h1>
        <SynthesisRunner
          reviewId={reviewId}
          candidateCount={candidateCount}
          onEstimate={estimateSynthesis}
          onRun={runSynthesis}
        />
      </header>

      {!hasThemes ? (
        candidateCount === 0 ? (
          <InsufficientData />
        ) : (
          <p className="text-sm text-ink-soft">Gere a síntese para começar.</p>
        )
      ) : (
        <ThemeList
          reviewId={reviewId}
          synthesisId={data.synthesis.id}
          themes={mappedThemes}
          onAccept={acceptTheme}
          onEdit={editTheme}
          onReject={rejectTheme}
          onReorder={reorderThemes}
          onMerge={mergeThemes}
          onSplit={splitTheme}
        />
      )}
    </main>
  );
}
