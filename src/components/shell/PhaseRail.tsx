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
  done: "text-ink",
  current: "font-semibold text-accent-deep",
  pending: "text-ink-faint",
  locked: "text-warn",
  optional_off: "text-ink-faint line-through opacity-60",
};

const NODE_CLASS: Record<PhaseStatus, string> = {
  done: "rail-node rail-node-done",
  current: "rail-node rail-node-current",
  pending: "rail-node",
  locked: "rail-node",
  optional_off: "rail-node rail-node-off",
};

export function PhaseRail({ phases }: { phases: Phase[] }) {
  return (
    <nav aria-label="Trilho de fases" className="border-r border-line p-6">
      <ol className="flex flex-col gap-1">
        {phases.map((p) => {
          const content = (
            <span className="flex items-start gap-3">
              <span className={NODE_CLASS[p.status]} aria-hidden />
              <span className={`text-sm ${STATUS_CLASS[p.status]}`}>
                {p.label}
                <span className="ml-1 text-xs text-gray-400">
                  ({STATUS_LABEL[p.status]})
                </span>
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
