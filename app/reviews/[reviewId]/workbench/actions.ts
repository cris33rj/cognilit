"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueImportJob } from "@shared/jobs/enqueue";
import { processImportJob } from "@shared/jobs/worker";
import { EnqueueValidationError } from "@shared/jobs/types";
import { searchSchema } from "@/lib/search/schema";
import type { SourceFormat } from "@shared/import/types";

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

export async function enqueueImport(
  reviewId: string,
  input: {
    format: SourceFormat;
    content: string;
    fieldMap?: Record<string, string>;
    search: unknown;
  },
) {
  const parsedSearch = searchSchema.safeParse(input.search);
  if (!parsedSearch.success) {
    return { ok: false as const, error: "Dados da busca inválidos." };
  }
  const { supabase } = await requireMember(reviewId);
  try {
    const res = await enqueueImportJob({ supabase }, reviewId, {
      format: input.format,
      content: input.content,
      fieldMap: input.fieldMap,
      search: parsedSearch.data,
    });
    revalidatePath(`/reviews/${reviewId}/workbench`);
    return { ok: true as const, jobId: res.job_id, itemCount: res.item_count };
  } catch (e) {
    if (e instanceof EnqueueValidationError) {
      return { ok: false as const, error: e.message }; // FR-016
    }
    throw e;
  }
}

/**
 * Gatilho síncrono do worker (Marco 1 / local / e2e — D-F3.5). Em produção o
 * worker é o jobs-worker agendado por pg_cron. Escopado: só processa jobs da
 * Revisão da qual o chamador é membro.
 */
export async function runImportWorker(reviewId: string) {
  await requireMember(reviewId);
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "import_parse")
    .in("status", ["queued", "running"]);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processImportJob({ supabase: admin }, j.id);
  }
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
