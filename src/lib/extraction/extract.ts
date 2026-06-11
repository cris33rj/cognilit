import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionFieldDef, LLMProvider } from "@/lib/ai/llm/types";

export interface ExtractionDeps {
  supabase: SupabaseClient; // service-role (bypassa RLS — escrita da IA)
  provider: LLMProvider;
}

interface LayerRow {
  id: string;
  page: number;
  char_start: number;
  char_end: number;
  content: string;
  origin: "nativo" | "ocr_ia";
}

/** Concatena as text_layer dos PDFs processados do estudo e indexa por página. */
export async function loadRecordText(
  supabase: SupabaseClient,
  reviewId: string,
  recordId: string,
): Promise<{
  documentText: string;
  pageIndex: { page: number; char_start: number; char_end: number }[];
  layerByPage: Map<
    number,
    { text_layer_id: string; origin: "nativo" | "ocr_ia" }
  >;
}> {
  const { data: docs, error: dErr } = await supabase
    .from("document")
    .select("id")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .in("processing_status", ["text_ready", "partial"]);
  if (dErr) throw new Error(dErr.message);
  const docIds = (docs ?? []).map((d) => (d as { id: string }).id);
  if (docIds.length === 0) {
    return { documentText: "", pageIndex: [], layerByPage: new Map() };
  }

  const { data: layers, error: lErr } = await supabase
    .from("text_layer")
    .select("id, page, char_start, char_end, content, origin")
    .in("document_id", docIds)
    .order("page", { ascending: true });
  if (lErr) throw new Error(lErr.message);

  let text = "";
  const pageIndex: { page: number; char_start: number; char_end: number }[] =
    [];
  const layerByPage = new Map<
    number,
    { text_layer_id: string; origin: "nativo" | "ocr_ia" }
  >();
  for (const l of (layers ?? []) as LayerRow[]) {
    const start = text.length;
    text += l.content + "\n";
    pageIndex.push({ page: l.page, char_start: start, char_end: text.length });
    if (!layerByPage.has(l.page)) {
      layerByPage.set(l.page, { text_layer_id: l.id, origin: l.origin });
    }
  }
  return { documentText: text, pageIndex, layerByPage };
}

/**
 * Extração por IA de um estudo (single, server-side — A1). Cria ai_suggestion
 * (target_kind='extraction') + extraction_value(pending/inferred) por campo.
 * Re-extração: aposenta pendentes anteriores (não ratificados); NUNCA toca o
 * validado (FR-019/019a). A IA não finaliza valor — só a RPC ratify_extraction_value.
 */
export async function runExtractionForRecord(
  deps: ExtractionDeps,
  reviewId: string,
  recordId: string,
): Promise<{ created: number }> {
  const { supabase, provider } = deps;

  const { data: fieldRows, error: fErr } = await supabase
    .from("extraction_field")
    .select("id, name, type, options, sort_order")
    .eq("review_id", reviewId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (fErr) throw new Error(fErr.message);
  const fields: ExtractionFieldDef[] = (fieldRows ?? []).map((f) => {
    const r = f as {
      id: string;
      name: string;
      type: ExtractionFieldDef["type"];
      options: string[] | null;
    };
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      options: r.options ?? undefined,
    };
  });
  if (fields.length === 0) return { created: 0 };

  const { documentText, pageIndex, layerByPage } = await loadRecordText(
    supabase,
    reviewId,
    recordId,
  );

  const result = await provider.extractFields({
    fields,
    documentText,
    pageIndex,
  });

  let created = 0;
  for (const ef of result.fields) {
    // Re-extração: pendentes anteriores (não ratificados) do mesmo (record,field) saem de cena.
    await supabase
      .from("extraction_value")
      .update({ state: "rejected", updated_at: new Date().toISOString() })
      .eq("record_id", recordId)
      .eq("field_id", ef.field_id)
      .in("state", ["pending", "inferred"]);

    const layer =
      ef.grounding.page != null
        ? layerByPage.get(ef.grounding.page)
        : undefined;
    const grounding = {
      text_layer_id: layer?.text_layer_id ?? null,
      page: ef.grounding.page,
      source_span: ef.grounding.source_span,
      origin: layer?.origin ?? ef.grounding.origin ?? null,
    };
    const state = ef.inferred ? "inferred" : "pending";

    const { data: value, error: vErr } = await supabase
      .from("extraction_value")
      .insert({
        review_id: reviewId,
        record_id: recordId,
        field_id: ef.field_id,
        state,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);
    const valueId = (value as { id: string }).id;

    const { data: suggestion, error: sErr } = await supabase
      .from("ai_suggestion")
      .insert({
        review_id: reviewId,
        target_kind: "extraction",
        target_id: valueId,
        output: ef.value,
        provenance: result.provenance,
        state,
        grounding,
        not_found: ef.value.value === null,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    await supabase
      .from("extraction_value")
      .update({ ai_suggestion_id: (suggestion as { id: string }).id })
      .eq("id", valueId);

    created += 1;
  }
  return { created };
}
