import type { RecordDetailData } from "@/lib/record/queries";

/** Divide "45-60" em start/end de página para SP/EP (sem inventar quando ausente). */
function splitPages(pages: string | null): {
  sp: string | null;
  ep: string | null;
} {
  if (!pages) return { sp: null, ep: null };
  const m = pages.split(/[-–]/).map((p) => p.trim());
  return { sp: m[0] || null, ep: m[1] ?? null };
}

/** Serializa registros como RIS (TY JOUR ... ER). Tags ausentes são OMITIDAS (§II). */
export function serializeRis(records: RecordDetailData[]): string {
  return records
    .map((r) => {
      const lines: string[] = ["TY  - JOUR", `TI  - ${r.title}`];
      for (const a of r.authors) lines.push(`AU  - ${a}`);
      if (r.year !== null) lines.push(`PY  - ${r.year}`);
      if (r.journal) lines.push(`JO  - ${r.journal}`);
      if (r.volume) lines.push(`VL  - ${r.volume}`);
      if (r.issue) lines.push(`IS  - ${r.issue}`);
      const { sp, ep } = splitPages(r.pages);
      if (sp) lines.push(`SP  - ${sp}`);
      if (ep) lines.push(`EP  - ${ep}`);
      if (r.doi) lines.push(`DO  - ${r.doi}`);
      if (r.abstract) lines.push(`AB  - ${r.abstract}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}
