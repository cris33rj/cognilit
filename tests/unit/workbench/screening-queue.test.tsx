import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScreeningQueue } from "@/components/workbench/ScreeningQueue";
import type { QueueRow, ReasonUsage } from "@/lib/screening/queries";

// O componente lê/escreve o estado de fila na URL (FR-037); em jsdom não há
// router de App Router, então mockamos next/navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/reviews/rev1/workbench",
  useSearchParams: () => new URLSearchParams("mode=title_abstract"),
}));

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
        loadReasons={vi.fn().mockResolvedValue([
          {
            id: "x1",
            label: "Fora do escopo",
            origin: "seed",
            sourceCriterionId: null,
            usageCount: 0,
          },
        ])}
        onAddReason={vi.fn().mockResolvedValue({ ok: true, id: "new1" })}
        onRemoveReason={vi.fn().mockResolvedValue({ ok: true })}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        onReasonUsage={vi.fn().mockResolvedValue([] as ReasonUsage[])}
        loadDetail={vi.fn().mockResolvedValue({
          id: "r1",
          title: "Estudo Alpha",
          authors: ["Autor X"],
          year: 2021,
          doi: null,
          language: "pt",
          abstract: "resumo alpha",
          journal: "Periódico Alpha",
          keywords: ["tema"],
          volume: null,
          issue: null,
          pages: null,
        })}
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

  it("Fatia 8 — painel de motivos NÃO aparece no modo título/resumo", async () => {
    renderQueue();
    await screen.findByText("Estudo Alpha");
    expect(
      screen.queryByRole("region", { name: /motivos de exclusão/i }),
    ).not.toBeInTheDocument();
  });

  it("Fatia 8 — no Texto completo, o painel lista os motivos com marcador 'do critério' só nos derivados", async () => {
    const loadReasons = vi.fn().mockResolvedValue([
      {
        id: "c1",
        label: "Idioma não elegível",
        origin: "criterion",
        sourceCriterionId: "crit1",
        usageCount: 0,
      },
      {
        id: "s1",
        label: "Fora do escopo",
        origin: "seed",
        sourceCriterionId: null,
        usageCount: 0,
      },
      {
        id: "m1",
        label: "Motivo manual",
        origin: "manual",
        sourceCriterionId: null,
        usageCount: 0,
      },
    ]);
    renderQueue({ stage: "full_text", loadReasons });
    // Espera os motivos resolverem (reasons.data) dentro do painel.
    await screen.findByText("Idioma não elegível");
    expect(
      screen.getByRole("region", { name: /motivos de exclusão/i }),
    ).toBeInTheDocument();
    // O marcador "do critério" aparece exatamente uma vez (só o origin=criterion).
    const markers = screen.getAllByText(/do critério/i);
    expect(markers).toHaveLength(1);
    // E está associado ao motivo derivado, não aos demais.
    expect(screen.getByText("Idioma não elegível")).toBeInTheDocument();
    expect(screen.getByText("Fora do escopo")).toBeInTheDocument();
    expect(screen.getByText("Motivo manual")).toBeInTheDocument();
  });

  it("Fatia 8 — adicionar motivo chama onAddReason com o label digitado", async () => {
    const onAddReason = vi.fn().mockResolvedValue({ ok: true, id: "new1" });
    renderQueue({ stage: "full_text", onAddReason });
    await screen.findByRole("region", { name: /motivos de exclusão/i });
    const input = screen.getByRole("textbox", {
      name: /novo motivo de exclusão/i,
    });
    await userEvent.type(input, "Sem grupo controle");
    await userEvent.click(screen.getByRole("button", { name: /adicionar/i }));
    expect(onAddReason).toHaveBeenCalledWith("Sem grupo controle");
  });

  it("Fatia 8 — remover motivo chama onRemoveReason com o id", async () => {
    const onRemoveReason = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ stage: "full_text", onRemoveReason });
    await screen.findByText("Fora do escopo");
    await userEvent.click(
      screen.getByRole("button", { name: /remover motivo fora do escopo/i }),
    );
    expect(onRemoveReason).toHaveBeenCalledWith("x1");
  });

  it("Bug 2 — no Texto completo a célula de status mostra a decisão de TC, não tsDecision", async () => {
    // No TC, tsDecision é sempre 'included' (só chega quem foi incluído no T/R).
    // A célula deve refletir ftDecision ('excluded'), não 'included'.
    const rows: QueueRow[] = [
      {
        ...ROWS[0]!,
        ai: null,
        decisionId: null,
        tsDecision: "included",
        ftDecision: "excluded",
      },
    ];
    renderQueue({
      stage: "full_text",
      loadQueue: vi.fn().mockResolvedValue(rows),
    });
    await screen.findByText("Estudo Alpha");
    expect(screen.getByText("excluded")).toBeInTheDocument();
    expect(screen.queryByText("included")).not.toBeInTheDocument();
  });

  it("Bug 1 — excluir selecionados no TC aplica o motivo escolhido a TODOS os selecionados", async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true });
    renderQueue({ stage: "full_text", onDecide });
    await screen.findByText("Estudo Alpha");
    await userEvent.keyboard("x"); // seleciona r1 (focado)
    await userEvent.keyboard("j"); // foca r2
    await userEvent.keyboard("x"); // seleciona r2
    await userEvent.click(
      screen.getByRole("button", { name: /excluir selecionados/i }),
    );
    // Abre UM portão de motivo para os 2 selecionados (não decide ainda).
    expect(onDecide).not.toHaveBeenCalled();
    const select = await screen.findByRole("combobox", { name: /motivo/i });
    await userEvent.selectOptions(select, "x1");
    await userEvent.click(
      screen.getByRole("button", { name: /confirmar exclus/i }),
    );
    expect(onDecide).toHaveBeenCalledTimes(2);
    expect(onDecide).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "exclude", exclusionReasonId: "x1" }),
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

  it("8.1 — motivo em uso mostra selo 'em uso (N)' e desabilita Remover", async () => {
    const loadReasons = vi.fn().mockResolvedValue([
      {
        id: "u1",
        label: "Motivo usado",
        origin: "seed",
        sourceCriterionId: null,
        usageCount: 2,
      },
    ]);
    renderQueue({ stage: "full_text", loadReasons });
    await screen.findByText("Motivo usado");
    expect(
      screen.getByRole("button", { name: /em uso \(2\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remover motivo motivo usado/i }),
    ).toBeDisabled();
  });

  it("8.1 — clicar no selo lista os artigos e 'Desfazer' chama onReverse", async () => {
    const onReasonUsage = vi
      .fn()
      .mockResolvedValue([
        { recordId: "r1", title: "Artigo X", decisionId: "dec1" },
      ]);
    const onReverse = vi.fn().mockResolvedValue({ ok: true });
    const loadReasons = vi.fn().mockResolvedValue([
      {
        id: "u1",
        label: "Motivo usado",
        origin: "seed",
        sourceCriterionId: null,
        usageCount: 1,
      },
    ]);
    renderQueue({ stage: "full_text", loadReasons, onReasonUsage, onReverse });
    await screen.findByText("Motivo usado");
    await userEvent.click(
      screen.getByRole("button", { name: /em uso \(1\)/i }),
    );
    expect(onReasonUsage).toHaveBeenCalledWith("u1");
    await userEvent.click(
      await screen.findByRole("button", {
        name: /desfazer exclusão de artigo x/i,
      }),
    );
    expect(onReverse).toHaveBeenCalledWith("dec1");
  });

  it("8.1 — artigo sem decisão reversível mostra nota, sem botão Desfazer", async () => {
    const onReasonUsage = vi
      .fn()
      .mockResolvedValue([
        { recordId: "r1", title: "Artigo Y", decisionId: null },
      ]);
    const loadReasons = vi.fn().mockResolvedValue([
      {
        id: "u1",
        label: "Motivo usado",
        origin: "seed",
        sourceCriterionId: null,
        usageCount: 1,
      },
    ]);
    renderQueue({ stage: "full_text", loadReasons, onReasonUsage });
    await screen.findByText("Motivo usado");
    await userEvent.click(
      screen.getByRole("button", { name: /em uso \(1\)/i }),
    );
    expect(
      await screen.findByText(/sem decisão reversível/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /desfazer exclusão de artigo y/i }),
    ).not.toBeInTheDocument();
  });

  it("Fatia 1 — full_text renderiza o painel de PDFs do estudo (US1)", async () => {
    renderQueue({
      stage: "full_text",
      loadDocuments: vi.fn().mockResolvedValue([]),
      onAttachPdf: vi.fn().mockResolvedValue({ ok: true }),
    });
    expect(await screen.findByText("PDFs do estudo")).toBeInTheDocument();
    expect(await screen.findByText(/nenhum pdf anexado/i)).toBeInTheDocument();
  });

  it("Fatia 1 — title_abstract NÃO mostra o painel de PDFs", async () => {
    renderQueue({ stage: "title_abstract" });
    await screen.findByText("Estudo Alpha");
    expect(screen.queryByText("PDFs do estudo")).not.toBeInTheDocument();
  });

  it("T/R: mostra o painel de detalhe do registro focado", async () => {
    renderQueue({ stage: "title_abstract" });
    expect(
      await screen.findByLabelText("Detalhe do registro"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Periódico Alpha")).toBeInTheDocument();
  });

  it("Texto completo: NÃO mostra o painel de detalhe", async () => {
    renderQueue({ stage: "full_text" });
    await screen.findByRole("grid", { name: /fila de triagem/i });
    expect(
      screen.queryByLabelText("Detalhe do registro"),
    ).not.toBeInTheDocument();
  });
});
