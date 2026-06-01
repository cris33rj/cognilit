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
        className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700 focus-visible:ring"
      >
        Aceitar
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-700 focus-visible:ring"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-600 focus-visible:ring"
      >
        Rejeitar
      </button>
    </div>
  );
}
