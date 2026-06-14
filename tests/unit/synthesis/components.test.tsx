import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeCard } from "@/components/synthesis/ThemeCard";
import { InsufficientData } from "@/components/synthesis/InsufficientData";
import { SummaryTable } from "@/components/synthesis/SummaryTable";
import { SynthesisRunner } from "@/components/synthesis/SynthesisRunner";
import { NarrativeEditor } from "@/components/synthesis/NarrativeEditor";

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

  it("célula objeto final_value {value,...} renderiza o .value, não [object Object]", () => {
    render(
      <SummaryTable
        table={{
          columns: ["Conceito"],
          rows: [
            {
              recordId: "r1",
              label: "Barbero 2020",
              cells: {
                Conceito: {
                  value: "mediação cultural",
                  source_span: null,
                  page: 3,
                },
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("mediação cultural")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it("célula objeto não-encontrado (value null) renderiza 'não encontrado'", () => {
    render(
      <SummaryTable
        table={{
          columns: ["Conceito"],
          rows: [
            {
              recordId: "r1",
              label: "Barbero 2020",
              cells: { Conceito: { value: null, reason: "not_found" } },
            },
          ],
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
        onEstimate={vi.fn().mockResolvedValue({
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

  it("fluxo duas fases: clica estimativa → mostra painel de custo e aviso byokMissing (FR-006)", async () => {
    const onEstimate = vi.fn().mockResolvedValue({
      ok: true,
      itemCount: 3,
      estimate: { tokensEstimated: 3600, cost: { usd: 0.009 } },
      byokMissing: true,
    });
    const onRun = vi.fn().mockResolvedValue({ ok: true });

    render(
      <SynthesisRunner
        reviewId="rev"
        candidateCount={3}
        onEstimate={onEstimate}
        onRun={onRun}
      />,
    );

    // Click "Gerar síntese" to trigger estimate
    fireEvent.click(screen.getByText(/gerar síntese/i));
    expect(onEstimate).toHaveBeenCalledWith("rev");

    // Wait for estimate panel to appear
    await waitFor(() => {
      expect(screen.getByText(/estimativa para 3 estudo/i)).toBeInTheDocument();
    });

    // Cost panel shows token count
    expect(screen.getByText(/3\.600/)).toBeInTheDocument();

    // byokMissing warning (FR-006)
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/chave byok/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// NarrativeEditor
// ---------------------------------------------------------------------------

describe("NarrativeEditor", () => {
  it("chama onSave com nova narrativa e patch correto ao clicar salvar", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });

    render(
      <NarrativeEditor
        reviewId="rev"
        themeId="t1"
        initialNarrative="Narrativa original"
        onSave={onSave}
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: /narrativa do tema/i,
    });
    fireEvent.change(textarea, { target: { value: "Narrativa editada" } });

    fireEvent.click(screen.getByText(/salvar narrativa/i));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rev", "t1", {
        narrative: "Narrativa editada",
      });
    });
  });
});
