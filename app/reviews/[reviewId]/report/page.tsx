import { createClient } from "@/lib/supabase/server";
import { loadReport } from "@/lib/report/queries";
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { loadPrismaChecklist } from "@/lib/prisma/checklist";
import { buildCharacteristicsTable } from "@/lib/prisma/characteristics";
import { loadExportArtifacts } from "@/lib/export/queries";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";
import { ReportRunner } from "@/components/report/ReportRunner";
import { RegenerateButton } from "@/components/report/RegenerateButton";
import { SectionEditor } from "@/components/report/SectionEditor";
import { PrismaChecklistPanel } from "@/components/report/PrismaChecklistPanel";
import { CharacteristicsTablePanel } from "@/components/report/CharacteristicsTablePanel";
import { ExportPanel } from "@/components/report/ExportPanel";
import {
  estimateReport,
  generateReport,
  regenerateReport,
  editReportSection,
  enqueueExport,
} from "./actions";

const SECTION_LABEL: Record<string, string> = {
  methods: "Métodos",
  results: "Resultados",
  discussion: "Discussão",
  conclusion: "Conclusão",
  ai_declaration: "Declaração de uso de IA",
  deviations: "Desvios do protocolo",
};

const EDIT_STATE_LABEL: Record<string, string> = {
  deterministic: "automática",
  ai_generated: "rascunho IA",
  human_edited: "editada",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const supabase = await createClient();

  const [report, flowModel, checklist, characteristics, artifacts] =
    await Promise.all([
      loadReport({ supabase }, reviewId),
      loadPrismaFlowModel(reviewId),
      loadPrismaChecklist({ supabase }, reviewId),
      buildCharacteristicsTable({ supabase }, reviewId),
      loadExportArtifacts({ supabase }, reviewId),
    ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Relatório</h1>
        <ReportRunner
          reviewId={reviewId}
          hasReport={!!report}
          onEstimate={estimateReport}
          onGenerate={generateReport}
        />
      </header>

      {report && (
        <RegenerateButton reviewId={reviewId} onRegenerate={regenerateReport} />
      )}

      {!report && (
        <p className="text-sm text-ink-soft">Gere o relatório para começar.</p>
      )}

      {report?.sections.map((s) => (
        <section key={s.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {SECTION_LABEL[s.kind] ?? s.kind}
            </h2>
            <span className="text-xs text-ink-soft">
              [{EDIT_STATE_LABEL[s.edit_state] ?? s.edit_state}]
            </span>
          </div>
          <SectionEditor
            reviewId={reviewId}
            sectionId={s.id}
            kind={s.kind}
            initial={s.content}
            onEdit={editReportSection}
          />
          {s.kind === "results" && (
            <div className="mt-4">
              <PrismaFlowchart reviewId={reviewId} model={flowModel} />
            </div>
          )}
        </section>
      ))}

      {report && (
        <>
          <PrismaChecklistPanel items={checklist} />
          <CharacteristicsTablePanel table={characteristics} />
          <ExportPanel
            reviewId={reviewId}
            artifacts={artifacts}
            onExport={enqueueExport}
          />
        </>
      )}
    </main>
  );
}
