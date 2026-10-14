import type { ReportInputs, BuiltSection } from "./types";

const TARGET_PHASE_LABEL: Record<string, string> = {
  eligibility: "Pergunta e critérios de elegibilidade",
  protocol_draft: "Protocolo",
  screening: "Triagem (título/resumo e texto completo)",
  extraction: "Extração de dados",
  synthesis_theme: "Síntese qualitativa",
  report_section: "Redação do relatório",
};

/** Métodos — factual, sem LLM (FR-012). Anexa a declaração de fases opcionais (FR-015). */
export function buildMethodsSection(i: ReportInputs): string {
  const lines: string[] = ["## Métodos", ""];

  if (i.question) {
    lines.push(
      `**Pergunta de pesquisa** (${i.question.framework.toUpperCase()}): ${i.question.questionText}`,
      "",
    );
    const fieldKeys = Object.keys(i.question.fields);
    if (fieldKeys.length > 0) {
      lines.push("Componentes do enquadramento:");
      for (const k of fieldKeys)
        lines.push(`- **${k}**: ${i.question.fields[k]}`);
      lines.push("");
    }
  }

  const incl = i.criteria.filter((c) => c.kind === "inclusion");
  const excl = i.criteria.filter((c) => c.kind === "exclusion");
  lines.push("### Critérios de elegibilidade", "");
  lines.push("**Inclusão:**");
  lines.push(
    ...(incl.length
      ? incl.map((c) => `- ${c.text}`)
      : ["- (não especificados)"]),
  );
  lines.push("", "**Exclusão:**");
  lines.push(
    ...(excl.length
      ? excl.map((c) => `- ${c.text}`)
      : ["- (não especificados)"]),
  );
  lines.push("");

  lines.push("### Protocolo", "");
  if (i.protocol?.state === "locked") {
    const dt = i.protocol.lockedAt
      ? formatDate(i.protocol.lockedAt)
      : "data não registrada";
    lines.push(`Protocolo travado em ${dt}.`, "");
  } else {
    lines.push("Protocolo ainda não travado.", "");
  }

  lines.push("### Fontes e estratégia de busca", "");
  if (i.searches.length) {
    for (const s of i.searches)
      lines.push(`- ${s.database}: ${s.recordCount} registro(s)`);
  } else {
    lines.push("- (nenhuma busca registrada)");
  }
  if (i.searchQuery) lines.push("", `String de busca: \`${i.searchQuery}\``);
  lines.push("");

  lines.push("### Fluxo de triagem", "");
  const c = i.counters;
  lines.push(
    `Identificados: ${c.identified}; duplicados removidos: ${c.duplicates}; ` +
      `triados: ${c.screened}; avaliados em texto completo: ${c.passedTs}; ` +
      `incluídos: ${c.includedFt}; excluídos em texto completo: ${c.excludedFt}.`,
    "",
  );

  lines.push(buildOptionalPhasesDeclaration(i));
  return lines.join("\n").trimEnd();
}

/** Resultados — A3: contagens + EMBUTE a narrativa de síntese ratificada (sem novo LLM). */
export function buildResultsSection(i: ReportInputs): string {
  const c = i.counters;
  const lines: string[] = ["## Resultados", ""];
  lines.push(
    `Foram incluídos ${c.includedFt} estudo(s) em texto completo, ` +
      `de ${c.identified} registro(s) identificados.`,
    "",
  );
  if (i.exclusions.length) {
    lines.push("Exclusões em texto completo por motivo:");
    for (const e of i.exclusions) lines.push(`- ${e.reasonLabel}: ${e.n}`);
    lines.push("");
  }
  lines.push("### Síntese qualitativa", "");
  if (i.themes.length === 0) {
    lines.push(
      "_Síntese qualitativa ainda não ratificada — gere e ratifique a síntese na fase Síntese para compor esta seção._",
    );
  } else {
    for (const t of i.themes) {
      lines.push(`#### ${t.name}`, "", t.narrative, "");
    }
  }
  return lines.join("\n").trimEnd();
}

/** Declaração de uso de IA — factual, das ai_suggestion usadas (FR-013/SC-003). Sem LLM. */
export function buildAiDeclaration(i: ReportInputs): string {
  const lines: string[] = [
    "## Declaração de uso de Inteligência Artificial",
    "",
  ];
  if (i.aiSuggestions.length === 0) {
    lines.push("Nenhuma etapa desta revisão utilizou assistência de IA.");
    return lines.join("\n");
  }
  const byPhase = new Map<string, { models: Set<string>; count: number }>();
  for (const s of i.aiSuggestions) {
    const label = TARGET_PHASE_LABEL[s.targetKind] ?? s.targetKind;
    const e = byPhase.get(label) ?? { models: new Set<string>(), count: 0 };
    e.models.add(`${s.model} (${s.version})`);
    e.count += 1;
    byPhase.set(label, e);
  }
  lines.push(
    "As seguintes etapas foram assistidas por IA, com validação humana:",
    "",
  );
  for (const [phase, e] of byPhase.entries()) {
    lines.push(
      `- **${phase}** — ${e.count} sugestão(ões); modelo: ${[...e.models].join(", ")}`,
    );
  }
  return lines.join("\n");
}

/** Desvios do protocolo — emendas datadas pós-travamento (FR-014/SC-004). Sem LLM. */
export function buildDeviations(i: ReportInputs): string {
  const lines: string[] = ["## Desvios do protocolo", ""];
  if (i.amendments.length === 0) {
    lines.push("Nenhum desvio registrado após o travamento do protocolo.");
    return lines.join("\n");
  }
  for (const a of i.amendments) {
    lines.push(
      `- **v${a.version}** (${a.datedAt}): ${JSON.stringify(a.change)}`,
    );
  }
  return lines.join("\n");
}

/** Declaração de fases opcionais desligadas (FR-015/SC-009). */
export function buildOptionalPhasesDeclaration(i: ReportInputs): string {
  if (i.optionalPhasesOff.length === 0) return "";
  const labels = i.optionalPhasesOff.map((p) => p.label).join(" e ");
  return (
    "### Fases opcionais não conduzidas\n\n" +
    `As seguintes fases metodológicas opcionais não foram conduzidas nesta revisão: ${labels}.`
  );
}

/** Monta as 4 seções determinísticas na ordem do relatório. */
export function buildDeterministicSections(i: ReportInputs): BuiltSection[] {
  return [
    { kind: "methods", content: buildMethodsSection(i), order: 0 },
    { kind: "results", content: buildResultsSection(i), order: 1 },
    { kind: "ai_declaration", content: buildAiDeclaration(i), order: 4 },
    { kind: "deviations", content: buildDeviations(i), order: 5 },
  ];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
