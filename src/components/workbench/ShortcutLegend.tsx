import { SHORTCUTS } from "@/lib/screening/config";

export function ShortcutLegend() {
  return (
    <details className="rounded border p-2 text-sm">
      <summary className="cursor-pointer font-medium">
        Atalhos de teclado
      </summary>
      <ul className="mt-2 grid grid-cols-2 gap-1">
        {SHORTCUTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <kbd className="rounded border bg-gray-100 px-1.5 text-xs">
              {s.key}
            </kbd>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
