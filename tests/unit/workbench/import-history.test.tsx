import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportHistory } from "@/components/workbench/ImportHistory";
import type { SearchSummary } from "@/lib/search/queries";

const SEARCHES: SearchSummary[] = [
  {
    id: "s1",
    database: "ERIC",
    createdAt: "2026-03-30T12:00:00Z",
    recordCount: 12,
  },
  {
    id: "s2",
    database: "PubMed",
    createdAt: "2026-04-02T12:00:00Z",
    recordCount: 5,
  },
];

describe("ImportHistory", () => {
  it("mostra uma linha por importação com base, data dd/mm/aaaa e contagem", () => {
    render(<ImportHistory searches={SEARCHES} />);
    expect(screen.getByText("ERIC")).toBeInTheDocument();
    expect(screen.getByText("PubMed")).toBeInTheDocument();
    const dates = screen.getAllByText(/\d{2}\/\d{2}\/\d{4}/);
    expect(dates).toHaveLength(2);
    expect(screen.getByText("12 artigos")).toBeInTheDocument();
    expect(screen.getByText("5 artigos")).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há importações", () => {
    render(<ImportHistory searches={[]} />);
    expect(screen.getByText("Nenhuma importação ainda.")).toBeInTheDocument();
  });
});
