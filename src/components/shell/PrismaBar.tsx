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
      className="flex flex-wrap items-center gap-4 rounded border bg-gray-50 px-4 py-2"
    >
      {items.map(([label, n]) => (
        <span key={label} className="text-sm text-gray-600">
          <span>{label}</span>
          {": "}
          <strong>{n}</strong>
        </span>
      ))}
    </div>
  );
}
