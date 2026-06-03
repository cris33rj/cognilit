"use client";

import { JobProgress } from "@/components/workbench/JobProgress";
import type { JobsAndUsage } from "@/lib/shell/usage";

const ACTIVE = ["queued", "running"];

export function JobsPanel({
  reviewId,
  data,
}: {
  reviewId: string;
  data: JobsAndUsage;
}) {
  const active = data.jobs.filter((j) => ACTIVE.includes(j.status));
  return (
    <aside
      aria-label="Jobs e consumo"
      className="flex w-56 shrink-0 flex-col gap-2 text-sm"
    >
      <div className="text-gray-600">
        Consumo de IA — entrada: <strong>{data.usage.tokensIn}</strong> tokens ·
        saída: <strong>{data.usage.tokensOut}</strong> tokens
      </div>
      {active.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {active.map((j) => (
            <li key={j.id}>
              <span className="text-gray-500">{j.type}</span>{" "}
              <JobProgress jobId={j.id} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-gray-400">Nenhum job em andamento.</span>
      )}
      <div className="flex gap-3">
        <a
          className="underline"
          href={`/reviews/${reviewId}/audit/export?format=json`}
        >
          Exportar auditoria (JSON)
        </a>
        <a
          className="underline"
          href={`/reviews/${reviewId}/audit/export?format=csv`}
        >
          CSV
        </a>
      </div>
    </aside>
  );
}
