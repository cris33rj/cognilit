import { ModeBar, type WorkbenchMode } from "@/components/workbench/ModeBar";
import { ImportPanel } from "@/components/workbench/ImportPanel";
import { ImportHistory } from "@/components/workbench/ImportHistory";
import { getSuggestedQuery, listSearches } from "@/lib/search/queries";
import { DuplicatesPanel } from "@/components/workbench/DuplicatesPanel";
import { ScreeningQueue } from "@/components/workbench/ScreeningQueue";
import { QueryProvider } from "@/components/providers/QueryProvider";
import {
  decideFuzzy,
  reverseDedup,
  fetchExactRemovals,
  fetchFuzzyCandidates,
  fetchScreeningQueue,
  fetchExclusionReasons,
  fetchReasonUsage,
  addExclusionReason,
  removeExclusionReason,
  decideScreening,
  reverseScreening,
  fetchRecordDetail,
} from "./actions";

export const dynamic = "force-dynamic";

const VALID: WorkbenchMode[] = [
  "import",
  "duplicates",
  "title_abstract",
  "full_text",
];

export default async function WorkbenchPage({
  params,
  searchParams,
}: {
  params: Promise<{ reviewId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { reviewId } = await params;
  const { mode } = await searchParams;
  const active: WorkbenchMode = VALID.includes(mode as WorkbenchMode)
    ? (mode as WorkbenchMode)
    : "import";
  const suggestedQuery =
    active === "import" ? await getSuggestedQuery(reviewId) : "";
  const searches = active === "import" ? await listSearches(reviewId) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="title-serif">Workbench</h1>
      </div>
      <ModeBar reviewId={reviewId} active={active} />
      <QueryProvider>
        {active === "import" ? (
          <div className="flex flex-col gap-6">
            <ImportPanel reviewId={reviewId} suggestedQuery={suggestedQuery} />
            <ImportHistory searches={searches} />
          </div>
        ) : active === "duplicates" ? (
          <DuplicatesPanel
            reviewId={reviewId}
            loadExactRemovals={fetchExactRemovals}
            loadFuzzyCandidates={fetchFuzzyCandidates}
            onDecide={decideFuzzy.bind(null, reviewId)}
            onReverse={reverseDedup.bind(null, reviewId)}
          />
        ) : active === "title_abstract" || active === "full_text" ? (
          <ScreeningQueue
            reviewId={reviewId}
            stage={active}
            loadQueue={fetchScreeningQueue}
            loadReasons={fetchExclusionReasons}
            onAddReason={addExclusionReason.bind(null, reviewId)}
            onRemoveReason={removeExclusionReason.bind(null, reviewId)}
            onDecide={decideScreening.bind(null, reviewId)}
            onReverse={reverseScreening.bind(null, reviewId)}
            onReasonUsage={fetchReasonUsage.bind(null, reviewId)}
            loadDetail={fetchRecordDetail}
          />
        ) : (
          <p className="text-sm text-ink-soft">
            Este modo é habilitado em uma etapa seguinte do Marco.
          </p>
        )}
      </QueryProvider>
    </div>
  );
}
