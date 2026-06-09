import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordDetail } from "@/components/workbench/RecordDetail";
import type { RecordDetailData } from "@/lib/record/queries";

const FULL: RecordDetailData = {
  id: "r1",
  title: "Edge AI on wearables",
  authors: ["Smith, J.", "Doe, A."],
  year: 2021,
  doi: "10.1/x",
  language: "en",
  abstract: "Um resumo detalhado do estudo.",
  journal: "Journal of Wearable Tech",
  keywords: ["edge AI", "wearables"],
  volume: "12",
  issue: "3",
  pages: "45–60",
};

describe("RecordDetail", () => {
  it("renderiza autores(ano), periódico, palavras-chave e resumo", () => {
    render(<RecordDetail detail={FULL} isLoading={false} />);
    expect(screen.getByText("Smith, J.; Doe, A. (2021)")).toBeInTheDocument();
    expect(screen.getByText("Journal of Wearable Tech")).toBeInTheDocument();
    expect(screen.getByText("edge AI")).toBeInTheDocument();
    expect(
      screen.getByText("Um resumo detalhado do estudo."),
    ).toBeInTheDocument();
  });

  it("omite campos ausentes sem quebrar", () => {
    render(
      <RecordDetail
        detail={{
          ...FULL,
          journal: null,
          doi: null,
          keywords: [],
          abstract: null,
        }}
        isLoading={false}
      />,
    );
    expect(screen.queryByText("Periódico")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Palavras-chave")).not.toBeInTheDocument();
  });

  it("NÃO renderiza nenhum vocabulário de IA (A-15.4)", () => {
    render(<RecordDetail detail={FULL} isLoading={false} />);
    expect(screen.queryByText(/sugest[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aceitar|rejeitar/i)).not.toBeInTheDocument();
  });

  it("estado de carregamento e estado vazio", () => {
    const { rerender } = render(<RecordDetail detail={null} isLoading />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    rerender(<RecordDetail detail={null} isLoading={false} />);
    expect(
      screen.getByText("Selecione um registro para ver os detalhes."),
    ).toBeInTheDocument();
  });
});
