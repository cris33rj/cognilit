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
      className="flex w-full flex-col gap-3 text-sm"
    >
      <div className="panel">
        <div>
          Consumo de IA — entrada: <strong>{data.usage.tokensIn}</strong> tokens
          · saída: <strong>{data.usage.tokensOut}</strong> tokens
        </div>
      </div>
      <div className="panel">
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
      </div>
      <div className="panel">
        <div className="flex gap-3">
          <a
            className="text-accent-deep hover:underline"
            href={`/reviews/${reviewId}/audit/export?format=json`}
          >
            Exportar auditoria (JSON)
          </a>
          <a
            className="text-accent-deep hover:underline"
            href={`/reviews/${reviewId}/audit/export?format=csv`}
          >
            CSV
          </a>
        </div>
      </div>
    </aside>
  );
}
