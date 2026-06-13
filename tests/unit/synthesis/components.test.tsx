import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeCard } from "@/components/synthesis/ThemeCard";
import { InsufficientData } from "@/components/synthesis/InsufficientData";
import { SummaryTable } from "@/components/synthesis/SummaryTable";
import { SynthesisRunner } from "@/components/synthesis/SynthesisRunner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const provenance = {
  model: "mock-llm",
  version: "0.0.0",
  prompt_or_span: "x",
  timestamp: new Date().toISOString(),
};

const theme = {
  id: "t1",
  name: "Tema A",
  narrative: "Narrativa pt-BR",
  state: "pending" as const,
  order: 0,
  summary_table: {
    columns: ["N"],
    rows: [{ recordId: "r1", label: "Silva 2020", cells: { N: 30 } }],
  },
  theme_finding: [{ extraction_value_id: "ev1", order: 0 }],
  provenance,
};

// ---------------------------------------------------------------------------
// ThemeCard
// ---------------------------------------------------------------------------

describe("ThemeCard", () => {
  const noop = vi.fn().mockResolvedValue({ ok: true });

  it("mostra nome, narrativa, chip de estado e refs de grounding", () => {
    render(
      <ThemeCard
        reviewId="rev"
        synthesisId="s1"
        theme={theme}
        onAccept={noop}
        onEdit={noop}
        onReject={noop}
        onReorder={noop}
      />,
    );
    expect(screen.getByText("Tema A")).toBeInTheDocument();
    expect(screen.getByText(/Narrativa pt-BR/)).toBeInTheDocument();
    // SuggestionChip renders "Sugestão de IA · pendente" for "pending" state
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
    // GroundingRefs: 1 achado
    expect(screen.getByText(/1 achado/i)).toBeInTheDocument();
  });

  it("mostra botões de aceitar, editar e rejeitar", () => {
    render(
      <ThemeCard
        reviewId="rev"
        synthesisId="s1"
        theme={theme}
        onAccept={noop}
        onEdit={noop}
        onReject={noop}
        onReorder={noop}
      />,
    );
    expect(screen.getByText("Aceitar")).toBeInTheDocument();
    expect(screen.getByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Rejeitar")).toBeInTheDocument();
  });

  it("clicar Aceitar chama onAccept com reviewId e themeId", () => {
    const onAccept = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ThemeCard
        reviewId="rev"
        synthesisId="s1"
        theme={theme}
        onAccept={onAccept}
        onEdit={noop}
        onReject={noop}
        onReorder={noop}
      />,
    );
    fireEvent.click(screen.getByText("Aceitar"));
    expect(onAccept).toHaveBeenCalledWith("rev", "t1");
  });

  it("clicar Rejeitar chama onReject com reviewId e themeId", () => {
    const onReject = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ThemeCard
        reviewId="rev"
        synthesisId="s1"
        theme={theme}
        onAccept={noop}
        onEdit={noop}
        onReject={onReject}
        onReorder={noop}
      />,
    );
    fireEvent.click(screen.getByText("Rejeitar"));
    expect(onReject).toHaveBeenCalledWith("rev", "t1");
  });
});

// ---------------------------------------------------------------------------
// InsufficientData
// ---------------------------------------------------------------------------

describe("InsufficientData", () => {
  it("comunica dados insuficientes (FR-007)", () => {
    render(<InsufficientData />);
    expect(screen.getByText(/dados insuficientes/i)).toBeInTheDocument();
  });

  it("mostra mensagem sobre síntese", () => {
    render(<InsufficientData />);
    expect(screen.getAllByText(/síntese/i).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SummaryTable
// ---------------------------------------------------------------------------

describe("SummaryTable", () => {
  it("renderiza cabeçalho com colunas", () => {
    render(
      <SummaryTable
        table={{
          columns: ["N", "Desenho"],
          rows: [
            {
              recordId: "r1",
              label: "Silva 2020",
              cells: { N: 30, Desenho: "RCT" },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText("Desenho")).toBeInTheDocument();
    expect(screen.getByText("Silva 2020")).toBeInTheDocument();
  });

  it("célula null renderiza 'não encontrado'", () => {
    render(
      <SummaryTable
        table={{
          columns: ["N"],
          rows: [{ recordId: "r1", label: "Silva 2020", cells: { N: null } }],
        }}
      />,
    );
    expect(screen.getByText(/não encontrado/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SynthesisRunner
// ---------------------------------------------------------------------------

describe("SynthesisRunner", () => {
  it("mostra botão 'Gerar síntese'", () => {
    render(
      <SynthesisRunner
        reviewId="rev"
        candidateCount={5}
        onEstimate={vi
          .fn()
          .mockResolvedValue({
            ok: true,
            itemCount: 5,
            estimate: { tokensEstimated: 100, cost: {} },
            byokMissing: false,
          })}
        onRun={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText(/gerar síntese/i)).toBeInTheDocument();
  });
});
