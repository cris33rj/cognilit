"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createReviewSchema } from "@/lib/reviews/schema";

export async function createReview(formData: FormData) {
  const parsed = createReviewSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    redirect(`/reviews/new?error=${encodeURIComponent("Informe um título")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_review", {
    p_title: parsed.success ? parsed.data.title : "",
  });

  if (error || !data) {
    redirect(
      `/reviews/new?error=${encodeURIComponent("Falha ao criar a Revisão")}`,
    );
  }

  redirect(`/reviews/${data.id}`);
}
