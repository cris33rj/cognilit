import { ProvenancePopover } from "@/components/ai/ProvenancePopover";
import type { Provenance } from "@/lib/ai/llm/types";

interface ThemeFinding {
  extraction_value_id: string;
  order: number;
}

/**
 * Exibe as referências de grounding (achados) de um tema.
 * Cada achado tem um ProvenancePopover para rastreabilidade (§II).
 */
export function GroundingRefs({
  findings,
  provenance,
}: {
  findings: ThemeFinding[];
  provenance: Provenance;
}) {
  const count = findings.length;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-ink-soft">
        {count} {count === 1 ? "achado" : "achados"}{" "}
        <ProvenancePopover provenance={provenance} />
      </p>
      {findings.length > 0 && (
        <ul className="space-y-0.5 pl-3">
          {findings
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((f) => (
              <li
                key={f.extraction_value_id}
                className="text-xs text-ink-faint"
              >
                <span className="font-mono">{f.extraction_value_id}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
