import type { PrismaCounters } from "@/lib/prisma/queries";

export function PrismaBar({ counters }: { counters: PrismaCounters }) {
  const items: [string, number][] = [
    ["Identificados", counters.identified],
    ["Duplicados", counters.duplicates],
    ["Triados", counters.screened],
    ["Incluídos (T/R)", counters.includedTs],
    ["Incluídos (TC)", counters.includedFt],
    ["Excluídos (TC)", counters.excludedFt],
  ];
  return (
    <div
      aria-live="polite"
      aria-label="Contadores PRISMA"
      className="flex flex-wrap items-center gap-6 border-b border-line bg-gradient-to-b from-paper-2 to-paper px-6 py-2"
    >
      {items.map(([label, n]) => (
        <span key={label} className="text-sm">
          <span className="metric-label">{label}</span>
          {": "}
          <strong className="metric-value">{n}</strong>
        </span>
      ))}
    </div>
  );
}
