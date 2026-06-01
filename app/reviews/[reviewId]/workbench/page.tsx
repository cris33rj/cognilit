import { ModeBar, type WorkbenchMode } from "@/components/workbench/ModeBar";
import { ImportPanel } from "@/components/workbench/ImportPanel";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { countRecords } from "@/lib/jobs/queries";

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
  const identified = await countRecords(reviewId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Workbench</h1>
        <span className="text-sm text-gray-600" aria-live="polite">
          Identificados (PRISMA): <strong>{identified}</strong>
        </span>
      </div>
      <ModeBar reviewId={reviewId} active={active} />
      <QueryProvider>
        {active === "import" ? (
          <ImportPanel reviewId={reviewId} />
        ) : (
          <p className="text-sm text-gray-500">
            Este modo é habilitado em uma etapa seguinte do Marco.
          </p>
        )}
      </QueryProvider>
    </div>
  );
}
