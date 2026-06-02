import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DuplicatesPanel } from "@/components/workbench/DuplicatesPanel";

function renderPanel(
  over: Partial<React.ComponentProps<typeof DuplicatesPanel>> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DuplicatesPanel
        reviewId="r1"
        loadExactRemovals={vi
          .fn()
          .mockResolvedValue([
            {
              decisionId: "d1",
              removedRecordId: "rb",
              keptRecordId: "ra",
              removedTitle: "Estudo X copia",
              keptTitle: "Estudo X",
              createdAt: "2026-06-01T00:00:00Z",
            },
          ])}
        loadFuzzyCandidates={vi
          .fn()
          .mockResolvedValue([
            {
              recordAId: "a",
              recordBId: "b",
              similarity: 0.95,
              titleA: "deep learning triage",
              titleB: "deep learning triages",
              yearA: "2023",
              yearB: "2023",
            },
          ])}
        onDecide={vi.fn().mockResolvedValue({ ok: true })}
        onReverse={vi.fn().mockResolvedValue({ ok: true })}
        {...over}
      />
    </QueryClientProvider>,
  );
}

describe("DuplicatesPanel (US3)", () => {
  it("mostra o par fuzzy lado a lado com ações mesma/distintas", async () => {
    renderPanel();
    expect(await screen.findByText("deep learning triage")).toBeInTheDocument();
    expect(screen.getByText("deep learning triages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mesma/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /distintas/i }),
    ).toBeInTheDocument();
  });

  it("lista as exatas removidas com botão desfazer", async () => {
    renderPanel();
    expect(await screen.findByText(/Estudo X copia/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /desfazer/i }),
    ).toBeInTheDocument();
  });
});
