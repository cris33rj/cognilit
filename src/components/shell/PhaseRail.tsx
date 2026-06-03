import Link from "next/link";
import type { Phase, PhaseStatus } from "@/lib/shell/phases";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  done: "feito",
  current: "em curso",
  pending: "pendente",
  locked: "travado",
  optional_off: "opcional — desligado",
};

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: "text-green-700",
  current: "font-semibold text-black",
  pending: "text-gray-400",
  locked: "text-amber-700",
  optional_off: "text-gray-300 line-through",
};

export function PhaseRail({ phases }: { phases: Phase[] }) {
  return (
    <nav aria-label="Trilho de fases" className="w-48 shrink-0 border-r pr-4">
      <ol className="flex flex-col gap-1">
        {phases.map((p) => {
          const content = (
            <span className={`text-sm ${STATUS_CLASS[p.status]}`}>
              {p.label}
              <span className="ml-1 text-xs text-gray-400">
                ({STATUS_LABEL[p.status]})
              </span>
            </span>
          );
          return (
            <li
              key={p.key}
              data-status={p.status}
              aria-current={p.status === "current" ? "step" : undefined}
              className="rounded px-2 py-1"
            >
              {p.href && p.status !== "optional_off" ? (
                <Link href={p.href}>{content}</Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
