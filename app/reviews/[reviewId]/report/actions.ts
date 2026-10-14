"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/ai/llm";
import { MissingByokError, type LLMProvider } from "@/lib/ai/llm/types";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
import { enqueueReportExportJob } from "@/lib/export/enqueue";
import { runReportExportWorkerWith } from "@/lib/export/batch-run";
import { regenerateDeterministicSections } from "@/lib/report/regenerate";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}

function revalidate(reviewId: string) {
  revalidatePath(`/reviews/${reviewId}/report`);
}

async function resolveProvider(reviewId: string): Promise<LLMProvider> {
  try {
    return await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) return new MockLLMProvider();
    throw e;
  }
}

/** Estimativa antes de rascunhar Discussão/Conclusão (§VII). */
export async function estimateReport(reviewId: string) {
  await requireMember(reviewId);

  let byokMissing = false;
  let provider: LLMProvider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) {
      provider = new MockLLMProvider();
      byokMissing = true;
    } else throw e;
  }

  const estimate = await provider.estimateCost({
    kind: "report_draft",
    itemCount: 2,
  });
  return { ok: true as const, estimate, byokMissing };
}

/** Gera/regenera o relatório completo: enfileira report_draft (member client) e roda o worker (admin). */
export async function generateReport(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  const provider = await resolveProvider(reviewId);
  await enqueueReportDraftJob({ supabase }, reviewId);
  await runReportDraftWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const };
}

/** Regenera só as seções determinísticas (sem LLM, sem custo); preserva human_edited. */
export async function regenerateReport(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const res = await regenerateDeterministicSections({ supabase }, reviewId);
  revalidate(reviewId);
  return { ok: true as const, ...res };
}

/** Enfileira a exportação (client membro) e roda o worker (admin). Sem IA, sem custo. */
export async function enqueueExport(reviewId: string, formats: string[]) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  await enqueueReportExportJob({ supabase }, reviewId, formats);
  await runReportExportWorkerWith(admin, reviewId);
  revalidate(reviewId);
  return { ok: true as const };
}

/** Edita uma seção → human_edited (RPC auditada). Resultados/decl-IA/desvios são rejeitados pela RPC. */
export async function editReportSection(
  reviewId: string,
  sectionId: string,
  content: string,
) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_report_section_content", {
    p_section_id: sectionId,
    p_content: content,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}
