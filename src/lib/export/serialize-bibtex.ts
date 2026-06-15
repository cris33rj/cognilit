import type { RecordDetailData } from "@/lib/record/queries";

/** Escapa chaves/contrabarras que quebrariam a entrada BibTeX. */
function clean(value: string): string {
  return value.replace(/[{}\\]/g, "").trim();
}

/** Chave de citação estável: 1º sobrenome + ano + 4 chars do id. */
function citeKey(r: RecordDetailData): string {
  const surname = (r.authors[0]?.split(",")[0] ?? "ref")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const year = r.year ?? "sd";
  return `${surname || "ref"}${year}_${r.id.slice(0, 4)}`;
}

/** Serializa registros como BibTeX. Campos ausentes são OMITIDOS (§II). */
export function serializeBibtex(records: RecordDetailData[]): string {
  return records
    .map((r) => {
      const fields: string[] = [`  title = {${clean(r.title)}}`];
      if (r.authors.length > 0)
        fields.push(`  author = {${r.authors.map(clean).join(" and ")}}`);
      if (r.year !== null) fields.push(`  year = {${r.year}}`);
      if (r.journal) fields.push(`  journal = {${clean(r.journal)}}`);
      if (r.volume) fields.push(`  volume = {${clean(r.volume)}}`);
      if (r.issue) fields.push(`  number = {${clean(r.issue)}}`);
      if (r.pages) fields.push(`  pages = {${clean(r.pages)}}`);
      if (r.doi) fields.push(`  doi = {${clean(r.doi)}}`);
      return `@article{${citeKey(r)},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}
