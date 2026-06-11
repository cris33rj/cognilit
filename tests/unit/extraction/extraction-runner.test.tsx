import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtractionRunner } from "@/components/extraction/ExtractionRunner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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

  it("clicar 'Aceitar' chama onRatify com state accepted", () => {
    const onRatify = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ExtractionRunner
        reviewId="r1"
        recordId="rec1"
        fields={[fields[0]!]}
        values={[values[0]!]}
        onRun={vi.fn()}
        onRatify={onRatify}
      />,
    );
    fireEvent.click(screen.getByText("Aceitar"));
    expect(onRatify).toHaveBeenCalledWith("r1", "v1", "accepted", {
      value: "42",
    });
  });

  it("valor já validado (accepted) não mostra ações de sugestão", () => {
    const accepted = [
      {
        ...values[0]!,
        state: "accepted" as const,
        final_value: { value: "42" },
      },
    ];
    render(
      <ExtractionRunner
        reviewId="r1"
        recordId="rec1"
        fields={[fields[0]!]}
        values={accepted}
        onRun={vi.fn()}
        onRatify={vi.fn()}
      />,
    );
    expect(screen.queryByText("Aceitar")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejeitar")).not.toBeInTheDocument();
  });

  it("clicar 'Extrair por IA' chama onRun", () => {
    const onRun = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ExtractionRunner
        reviewId="r1"
        recordId="rec1"
        fields={fields}
        values={values}
        onRun={onRun}
        onRatify={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Extrair por IA"));
    expect(onRun).toHaveBeenCalledWith("r1", "rec1");
  });
});
