import fs from "node:fs";
import path from "node:path";
// @ts-expect-error citeproc não traz tipos próprios
import CSL from "citeproc";
import type { RecordDetailData } from "@/lib/record/queries";

export interface CslItem {
  id: string;
  type: "article-journal";
  title: string;
  author?: { family: string; given?: string }[];
  issued?: { "date-parts": number[][] };
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
}

function splitAuthor(a: string): { family: string; given?: string } {
  const idx = a.indexOf(",");
  if (idx === -1) return { family: a.trim() };
  const family = a.slice(0, idx).trim();
  const given = a.slice(idx + 1).trim();
  return given ? { family, given } : { family };
}

export function recordToCslJson(r: RecordDetailData): CslItem {
  const item: CslItem = {
    id: r.id,
    type: "article-journal",
    title: r.title || "[título não informado]",
  };
  if (r.authors.length > 0) item.author = r.authors.map(splitAuthor);
  if (r.year !== null) item.issued = { "date-parts": [[r.year]] };
  if (r.journal) item["container-title"] = r.journal;
  if (r.volume) item.volume = r.volume;
  if (r.issue) item.issue = r.issue;
  if (r.pages) item.page = r.pages;
  if (r.doi) item.DOI = r.doi;
  return item;
}

const CSL_DIR = path.join(process.cwd(), "src/lib/export/csl");
let styleXml: string | null = null;
let localeXml: string | null = null;

function loadAssets() {
  if (styleXml === null)
    styleXml = fs.readFileSync(path.join(CSL_DIR, "apa.csl"), "utf-8");
  if (localeXml === null)
    localeXml = fs.readFileSync(
      path.join(CSL_DIR, "locales-pt-BR.xml"),
      "utf-8",
    );
}

export function formatCitationsApa7(records: RecordDetailData[]): string {
  if (records.length === 0) return "";
  loadAssets();

  const items: Record<string, CslItem> = {};
  for (const r of records) {
    const item = recordToCslJson(r);
    if (!item.author) {
      item.author = [{ family: "[autor não informado]" }];
    }
    items[item.id] = item;
  }

  const sys = {
    retrieveLocale: () => localeXml as string,
    retrieveItem: (id: string) => items[id],
  };

  const engine = new CSL.Engine(sys, styleXml as string, "pt-BR");
  engine.updateItems(Object.keys(items));
  const bib = engine.makeBibliography();
  if (!bib || !Array.isArray(bib[1])) return "";
  const entries = (bib[1] as string[]).map((e) =>
    e
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return entries.join("\n");
}
