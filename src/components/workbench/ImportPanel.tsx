"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseContent } from "@shared/import/index";
import type { ParsedRecord, SourceFormat } from "@shared/import/types";
import { searchSchema, type SearchInput } from "@/lib/search/schema";
import {
  enqueueImport,
  runImportWorker,
} from "../../../app/reviews/[reviewId]/workbench/actions";
import { ImportPreview } from "./ImportPreview";
import { JobProgress } from "./JobProgress";

function formatFromName(name: string): SourceFormat | null {
  if (name.endsWith(".ris")) return "ris";
  if (name.endsWith(".bib") || name.endsWith(".bibtex")) return "bibtex";
  if (name.endsWith(".csv")) return "csv";
  return null;
}

export function ImportPanel({ reviewId }: { reviewId: string }) {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<SourceFormat | null>(null);
  const [preview, setPreview] = useState<ParsedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { register, handleSubmit, formState } = useForm<SearchInput>({
    resolver: zodResolver(searchSchema),
    defaultValues: { queryString: "", database: "", searchedOn: "", hits: 0 },
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setJobId(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const fmt = formatFromName(file.name.toLowerCase());
    if (!fmt) {
      setError("Formato não suportado. Use .ris, .bib ou .csv.");
      setPreview([]);
      setFormat(null);
      return;
    }
    const text = await file.text();
    setContent(text);
    setFormat(fmt);
    const result = parseContent(fmt, text); // preview client-side (FR-014)
    setPreview(result.records);
    if (result.records.length === 0) {
      setError(
        result.errors[0]?.message ??
          "Nenhum registro reconhecido neste arquivo.",
      );
    }
  }

  async function onConfirm(search: SearchInput) {
    if (!format || preview.length === 0) return;
    setPending(true);
    setError(null);
    const res = await enqueueImport(reviewId, { format, content, search });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    setJobId(res.jobId);
    // Marco 1: dispara o worker (stand-in do pg_cron — D-F3.5).
    await runImportWorker(reviewId);
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="import-file" className="text-sm font-medium">
          Arquivo de referências (RIS, BibTeX ou CSV)
        </label>
        <input
          id="import-file"
          type="file"
          accept=".ris,.bib,.bibtex,.csv"
          onChange={onFile}
        />
      </div>

      <ImportPreview records={preview} />

      <form onSubmit={handleSubmit(onConfirm)} className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Registro da busca</h2>
        <input
          {...register("queryString")}
          placeholder="String de busca"
          className="rounded border p-2"
        />
        <input
          {...register("database")}
          placeholder="Base consultada"
          className="rounded border p-2"
        />
        <input
          {...register("searchedOn")}
          type="date"
          className="rounded border p-2"
        />
        <input
          {...register("hits")}
          type="number"
          placeholder="Nº de hits"
          className="rounded border p-2"
        />
        {formState.errors.queryString && (
          <p className="text-sm text-red-600">
            {formState.errors.queryString.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || preview.length === 0}
          className="self-start rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Confirmar importação
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {jobId && <JobProgress jobId={jobId} />}
    </section>
  );
}
