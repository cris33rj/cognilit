"use client";

import { useId, useRef, useState } from "react";

interface NarrativeEditorProps {
  reviewId: string;
  themeId: string;
  initialNarrative: string;
  onSave: (
    reviewId: string,
    themeId: string,
    patch: { narrative: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Textarea controlado (pt-BR) para editar a narrativa de um tema.
 * Ao salvar, chama onSave (que deve ser wired ao editTheme action).
 * Move o estado para "edited".
 */
export function NarrativeEditor({
  reviewId,
  themeId,
  initialNarrative,
  onSave,
}: NarrativeEditorProps) {
  const id = useId();
  const [value, setValue] = useState(initialNarrative);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSave() {
    if (value === initialNarrative) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await onSave(reviewId, themeId, { narrative: value });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Falha ao salvar a narrativa.");
    } else {
      setSaved(true);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-ink-soft">
        Narrativa
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={4}
        disabled={saving}
        aria-label="Narrativa do tema"
        className="w-full rounded border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus:outline-none focus-visible:ring disabled:opacity-50"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || value === initialNarrative}
          className="rounded border border-accent px-2 py-0.5 text-xs text-accent focus-visible:ring disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar narrativa"}
        </button>
        {saved && (
          <span className="text-xs text-done" role="status">
            Salvo
          </span>
        )}
        {error && (
          <span className="text-xs text-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
