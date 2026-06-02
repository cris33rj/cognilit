import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreeningQueue } from "@/components/workbench/ScreeningQueue";
import type { QueueRow } from "@/lib/screening/queries";

// useVirtualizer returns no items in jsdom (no scrollable dimensions).
// Mock it to render all rows at fixed offsets so UI assertions work.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
    const size = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      start: i * size,
      size,
      key: i,
      lane: 0,
      end: (i + 1) * size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
      scrollToIndex: vi.fn(),
    };
  },
}));

const ROWS: QueueRow[] = [
  {
    recordId: "r1",
    title: "Estudo Alpha",
    abstract: "resumo alpha",
    year: "2021",
    corpusState: "active",
    tsDecision: null,
    ftDecision: null,
    ftExclusionReasonId: null,
    decisionId: "d1",
    ai: {
      suggestionId: "s1",
      recommendation: "include",
      confidence: 0.8,
      reason: "tema relevante",
      state: "pending",
    },
  },
  {
    recordId: "r2",
    title: "Estudo Beta",
    abstract: null,
    year: "2019",
    corpusState: "active",
    tsDecision: null,
    ftDecision: null,
    ftExclusionReasonId: null,
    decisionId: null,
    ai: null,
  },
];

function renderQueue(
  over: Partial<React.ComponentProps<typeof ScreeningQueue>> = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ScreeningQueue
        reviewId="rev1"
        stage="title_abstract"
        loadQueue={vi.fn().mockResolvedValue(ROWS)}
        loadReasons={vi
          .fn()
          .mockResolvedValue([{ id: "x1", label: "Fora do escopo" }])}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        {...over}
      />
    </QueryClientProvider>,
  );
}

describe("ScreeningQueue (US4)", () => {
  it("renderiza a fila com legenda de atalhos e a sugestão de IA distinta", async () => {
    renderQueue();
    expect(await screen.findByText("Estudo Alpha")).toBeInTheDocument();
    expect(screen.getByText(/tema relevante/i)).toBeInTheDocument();
    expect(
      screen.getByRole("grid", { name: /fila de triagem/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/atalhos/i)).toBeInTheDocument();
  });

  it("decide por teclado: tecla 'i' no item focado chama onDecide include", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("i");
    expect(onDecide).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "r1",
        stage: "title_abstract",
        decision: "include",
      }),
    );
  });

  it("no Texto completo, excluir exige escolher motivo antes de confirmar (FR-025)", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ stage: "full_text", onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("e");
    expect(onDecide).not.toHaveBeenCalled();
    expect(
      screen.getByRole("combobox", { name: /motivo/i }),
    ).toBeInTheDocument();
  });

  it("ações em lote: selecionar 2 e incluir chama onDecide por item (FR-039)", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("x"); // seleciona o focado (r1)
    await userEvent.keyboard("j"); // move p/ r2
    await userEvent.keyboard("x"); // seleciona r2
    await userEvent.click(
      screen.getByRole("button", { name: /incluir selecionados/i }),
    );
    expect(onDecide).toHaveBeenCalledTimes(2);
  });

  it("Fix 1 — confirmar exclusão: botão chama onDecide com motivo (FR-025 mouse path)", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ stage: "full_text", onDecide });
    await screen.findByText("Estudo Alpha");
    // Pressionar 'e' abre o gate mas NÃO chama onDecide ainda
    await userEvent.keyboard("e");
    expect(onDecide).not.toHaveBeenCalled();
    // O botão "Confirmar exclusão" deve estar presente
    const confirmBtn = screen.getByRole("button", {
      name: /confirmar exclus/i,
    });
    expect(confirmBtn).toBeInTheDocument();
    // Sem motivo selecionado: botão desabilitado
    expect(confirmBtn).toBeDisabled();
    // Selecionar motivo
    const select = screen.getByRole("combobox", { name: /motivo/i });
    await userEvent.selectOptions(select, "x1");
    // Agora o botão está habilitado
    expect(confirmBtn).not.toBeDisabled();
    // Clicar confirma a exclusão
    await userEvent.click(confirmBtn);
    expect(onDecide).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "exclude",
        exclusionReasonId: "x1",
      }),
    );
  });

  it("Fix 2d — botão Desfazer aparece quando row.decisionId é não-nulo (FR-026)", async () => {
    const onReverse = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ onReverse });
    await screen.findByText("Estudo Alpha");
    // r1 tem decisionId='d1' → deve mostrar Desfazer
    const desfazers = screen.getAllByRole("button", { name: /desfazer/i });
    expect(desfazers.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(desfazers[0]!);
    expect(onReverse).toHaveBeenCalledWith("d1");
  });
});
