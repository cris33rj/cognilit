"use client";

export function SuggestionActions({
  onAccept,
  onEdit,
  onReject,
  disabled,
}: {
  onAccept: () => void;
  onEdit: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex gap-2"
      role="group"
      aria-label="Ações da sugestão de IA"
    >
      <button
        type="button"
        onClick={onAccept}
        disabled={disabled}
        className="rounded border border-done px-2 py-0.5 text-xs text-done focus-visible:ring"
      >
        Aceitar
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="rounded border border-warn px-2 py-0.5 text-xs text-warn focus-visible:ring"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="rounded border border-line px-2 py-0.5 text-xs text-ink-faint focus-visible:ring"
      >
        Rejeitar
      </button>
    </div>
  );
}
