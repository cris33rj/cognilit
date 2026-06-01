import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuggestionChip } from "@/components/ai/SuggestionChip";

describe("SuggestionChip", () => {
  it("exibe o rótulo pt-BR do estado e marca como IA", () => {
    render(<SuggestionChip state="pending" />);
    expect(screen.getByText(/Sugestão de IA · pendente/)).toBeInTheDocument();
  });

  it("estado rejeitado usa rótulo 'Rejeitada'", () => {
    render(<SuggestionChip state="rejected" />);
    expect(screen.getByText("Rejeitada")).toBeInTheDocument();
  });
});
