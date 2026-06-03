export function NotFound({ what = "Resultado" }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-line-strong px-2 py-0.5 text-xs italic text-ink-faint">
      {what}: não encontrado
    </span>
  );
}
