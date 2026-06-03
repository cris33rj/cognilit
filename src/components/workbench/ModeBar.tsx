import Link from "next/link";

export type WorkbenchMode =
  | "import"
  | "duplicates"
  | "title_abstract"
  | "full_text";

const MODES: { key: WorkbenchMode; label: string; enabled: boolean }[] = [
  { key: "import", label: "Importar", enabled: true },
  { key: "duplicates", label: "Duplicatas", enabled: true },
  { key: "title_abstract", label: "Título/Resumo", enabled: true },
  { key: "full_text", label: "Texto completo", enabled: true },
];

export function ModeBar({
  reviewId,
  active,
}: {
  reviewId: string;
  active: WorkbenchMode;
}) {
  return (
    <nav
      aria-label="Modos do workbench"
      className="flex gap-1 border-b pb-2"
      role="tablist"
    >
      {MODES.map((m) =>
        m.enabled ? (
          <Link
            key={m.key}
            href={`/reviews/${reviewId}/workbench?mode=${m.key}`}
            role="tab"
            aria-selected={active === m.key}
            className={`rounded px-3 py-1 text-sm ${
              active === m.key ? "bg-ink text-paper" : "hover:bg-paper-2"
            }`}
          >
            {m.label}
          </Link>
        ) : (
          <span
            key={m.key}
            role="tab"
            aria-disabled="true"
            title="Disponível em uma etapa seguinte"
            className="cursor-not-allowed rounded px-3 py-1 text-sm text-ink-faint"
          >
            {m.label}
          </span>
        ),
      )}
    </nav>
  );
}
