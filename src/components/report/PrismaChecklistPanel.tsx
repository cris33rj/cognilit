import type { ChecklistItem } from "@/lib/prisma/checklist";

const STATUS_LABEL: Record<ChecklistItem["status"], string> = {
  met: "Atendido",
  pending: "Pendente",
  not_applicable: "Não aplicável",
};

const STATUS_CLASS: Record<ChecklistItem["status"], string> = {
  met: "text-emerald-700",
  pending: "text-amber-700",
  not_applicable: "text-ink-soft",
};

export function PrismaChecklistPanel({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        O checklist é gerado junto com o relatório.
      </p>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Checklist PRISMA 2020</h2>
      <ul className="divide-y divide-line rounded border border-line">
        {items.map((it) => (
          <li
            key={it.itemCode}
            className="flex items-baseline gap-3 px-3 py-2 text-sm"
          >
            <span className="w-6 shrink-0 text-ink-soft">{it.itemCode}</span>
            <span className="flex-1">
              {it.label}
              {it.sectionRef && (
                <span className="text-ink-soft"> — {it.sectionRef}</span>
              )}
            </span>
            <span className={`shrink-0 text-xs ${STATUS_CLASS[it.status]}`}>
              {STATUS_LABEL[it.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
