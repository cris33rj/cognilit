import { createClient } from "@/lib/supabase/server";
import { getPrismaCounters } from "@/lib/prisma/queries";

export type PhaseStatus =
  | "done"
  | "current"
  | "pending"
  | "locked"
  | "optional_off";

export type PhaseKey =
  | "question"
  | "protocol"
  | "import"
  | "duplicates"
  | "screening_ts"
  | "screening_ft"
  | "extraction"
  | "synthesis"
  | "report"
  | "risk_of_bias"
  | "certainty";

export interface Phase {
  key: PhaseKey;
  label: string;
  href: string | null;
  status: PhaseStatus;
}

export interface PhaseInput {
  hasQuestion: boolean;
  protocolStatus: "none" | "draft" | "locked";
  identified: number;
  duplicates: number;
  screenedTs: number;
  includedTs: number;
  /** Cumulativo dos que passaram no T/R (PRISMA "assessed for eligibility"). */
  passedTs: number;
  includedFt: number;
  excludedFt: number;
  /** Há ao menos um extraction_value ratificado (accepted/edited) na Revisão. */
  extractionRatified: boolean;
  /** Síntese qualitativa concluída (synthesis.status === 'ready'). */
  synthesisReady: boolean;
  /** Relatório estruturado concluído (report.status === 'ready'). */
  reportReady: boolean;
}

interface PhaseDef {
  key: PhaseKey;
  label: string;
  href: (reviewId: string) => string | null;
  completed: (i: PhaseInput) => boolean;
  /** Quando retorna true, a fase é exibida como 'locked' independentemente do frontier. */
  isLocked?: (i: PhaseInput) => boolean;
}

const PIPELINE: PhaseDef[] = [
  {
    key: "question",
    label: "Pergunta",
    href: (r) => `/reviews/${r}/question`,
    completed: (i) => i.hasQuestion,
  },
  {
    key: "protocol",
    label: "Protocolo",
    href: (r) => `/reviews/${r}/protocol`,
    completed: (i) => i.protocolStatus === "locked",
  },
  {
    key: "import",
    label: "Importar",
    href: (r) => `/reviews/${r}/workbench?mode=import`,
    completed: (i) => i.identified > 0,
  },
  {
    key: "duplicates",
    label: "Duplicatas",
    href: (r) => `/reviews/${r}/workbench?mode=duplicates`,
    completed: (i) =>
      i.identified > 0 && (i.screenedTs > 0 || i.duplicates > 0),
  },
  {
    key: "screening_ts",
    label: "Triagem T/R",
    href: (r) => `/reviews/${r}/workbench?mode=title_abstract`,
    completed: (i) =>
      i.identified > 0 &&
      i.screenedTs >= Math.max(1, i.identified - i.duplicates),
  },
  {
    key: "screening_ft",
    label: "Triagem TC",
    href: (r) => `/reviews/${r}/workbench?mode=full_text`,
    // Concluída quando todos que passaram no T/R (passedTs, cumulativo) têm
    // decisão de TC. Usar includedTs (inventário) aqui falha: ele zera quando
    // todos avançam, então a fase nunca fecharia.
    completed: (i) =>
      i.passedTs > 0 && i.includedFt + i.excludedFt >= i.passedTs,
  },
  {
    key: "extraction",
    label: "Extração",
    href: (r) => `/reviews/${r}/extraction`,
    // Fase pós-triagem (D19). Concluída quando há ≥1 valor ratificado pelo humano.
    completed: (i) => i.extractionRatified,
  },
  {
    key: "synthesis",
    label: "Síntese",
    href: (r) => `/reviews/${r}/synthesis`,
    // Bloqueada até que a extração esteja ratificada.
    isLocked: (i) => !i.extractionRatified,
    completed: (i) => i.synthesisReady,
  },
  {
    key: "report",
    label: "Relatório",
    href: (r) => `/reviews/${r}/report`,
    // Bloqueada até a síntese concluir (Resultados embute a síntese ratificada).
    isLocked: (i) => !i.synthesisReady,
    completed: (i) => i.reportReady,
  },
];

const OPTIONAL: { key: PhaseKey; label: string }[] = [
  { key: "risk_of_bias", label: "Risco de Viés" },
  { key: "certainty", label: "Certeza (CERQual)" },
];

/** Deriva o estado de cada fase a partir dos contadores e do protocolo (pura). */
export function computePhaseStates(
  reviewId: string,
  input: PhaseInput,
): Phase[] {
  let frontierTaken = false;
  const pipeline = PIPELINE.map((def): Phase => {
    const done = def.completed(input);
    let status: PhaseStatus;
    if (def.key === "protocol" && input.protocolStatus === "locked") {
      status = "locked";
    } else if (def.isLocked?.(input)) {
      status = "locked";
    } else if (done) {
      status = "done";
    } else if (!frontierTaken) {
      status = "current";
      frontierTaken = true;
    } else {
      status = "pending";
    }
    return { key: def.key, label: def.label, href: def.href(reviewId), status };
  });

  const optional = OPTIONAL.map(
    (o): Phase => ({
      key: o.key,
      label: o.label,
      href: null,
      status: "optional_off",
    }),
  );

  return [...pipeline, ...optional];
}

/** Junta os insumos (contadores + protocolo + pergunta) e deriva o trilho. */
export async function loadPhaseStates(reviewId: string): Promise<Phase[]> {
  const supabase = await createClient();
  const counters = await getPrismaCounters(reviewId);

  const { count: questionCount } = await supabase
    .from("question")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);

  const { data: protocol } = await supabase
    .from("protocol")
    .select("state")
    .eq("review_id", reviewId)
    .maybeSingle();
  const protocolStatus =
    protocol?.state === "locked" ? "locked" : protocol ? "draft" : "none";

  const { count: ratifiedCount } = await supabase
    .from("extraction_value")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .in("state", ["accepted", "edited"]);

  const { data: synthesis } = await supabase
    .from("synthesis")
    .select("status")
    .eq("review_id", reviewId)
    .maybeSingle();

  const { data: reportRow } = await supabase
    .from("report")
    .select("status")
    .eq("review_id", reviewId)
    .maybeSingle();
  const reportReady = reportRow?.status === "ready";

  return computePhaseStates(reviewId, {
    hasQuestion: (questionCount ?? 0) > 0,
    protocolStatus,
    identified: counters.identified,
    duplicates: counters.duplicates,
    screenedTs: counters.screened,
    includedTs: counters.includedTs,
    passedTs: counters.passedTs,
    includedFt: counters.includedFt,
    excludedFt: counters.excludedFt,
    extractionRatified: (ratifiedCount ?? 0) > 0,
    synthesisReady: synthesis?.status === "ready",
    reportReady,
  });
}
