import { ModeBar, type WorkbenchMode } from "@/components/workbench/ModeBar";
import { ImportPanel } from "@/components/workbench/ImportPanel";
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
  decideScreening,
  reverseScreening,
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workbench</h1>
      </div>
      <ModeBar reviewId={reviewId} active={active} />
      <QueryProvider>
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} />
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
            onDecide={decideScreening.bind(null, reviewId)}
            onReverse={reverseScreening.bind(null, reviewId)}
          />
        ) : (
          <p className="text-sm text-gray-500">
            Este modo é habilitado em uma etapa seguinte do Marco.
          </p>
        )}
      </QueryProvider>
    </div>
  );
}
