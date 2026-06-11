import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExtractionRunner } from "@/components/extraction/ExtractionRunner";

const fields = [
  {
    id: "f1",
    name: "Amostra",
    type: "number" as const,
    options: null,
    sort_order: 1,
  },
  {
    id: "f2",
    name: "Desenho",
    type: "select" as const,
    options: ["RCT"],
    sort_order: 2,
  },
];

const values = [
  {
    id: "v1",
    field_id: "f1",
    state: "pending" as const,
    final_value: null,
    not_found: false,
    output: { value: "42", source_span: "n=42", page: 3 },
    provenance: {
      model: "mock-llm",
      version: "0.0.0",
      prompt_or_span: "extract",
      timestamp: new Date().toISOString(),
    },
    grounding: {
      text_layer_id: "t1",
      page: 3,
      source_span: "n=42",
      origin: "nativo",
    },
  },
  {
    id: "v2",
    field_id: "f2",
    state: "inferred" as const,
    final_value: null,
    not_found: false,
    output: { value: "RCT", source_span: null, page: null },
    provenance: {
      model: "mock-llm",
      version: "0.0.0",
      prompt_or_span: "extract",
      timestamp: new Date().toISOString(),
    },
    grounding: {
      text_layer_id: null,
      page: null,
      source_span: null,
      origin: null,
    },
  },
];

describe("ExtractionRunner", () => {
  it("renderiza campos com chip de estado e ações da sugestão", () => {
    render(
      <ExtractionRunner
        reviewId="r1"
        recordId="rec1"
        fields={fields}
        values={values}
        onRun={vi.fn()}
        onRatify={vi.fn()}
      />,
    );
    expect(screen.getByText("Amostra")).toBeInTheDocument();
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
    expect(screen.getByText("Inferida")).toBeInTheDocument();
    expect(screen.getAllByText("Aceitar").length).toBeGreaterThan(0);
  });

  it("campo not_found renderiza 'não encontrado'", () => {
    const nf = [
      {
        ...values[0],
        not_found: true,
        output: {
          value: null,
          page: null,
          source_span: null,
          reason: "not_found",
        },
      },
    ];
    render(
      <ExtractionRunner
        reviewId="r1"
        recordId="rec1"
        fields={[fields[0]!]}
        values={nf as never}
        onRun={vi.fn()}
        onRatify={vi.fn()}
      />,
    );
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });
});
