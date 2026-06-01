export function NotFound({ what = "Resultado" }: { what?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-zinc-400 px-2 py-0.5 text-xs italic text-zinc-600 dark:text-zinc-300">
      {what}: não encontrado
    </span>
  );
}
