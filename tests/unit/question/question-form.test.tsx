import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock server-only modules before component import
vi.mock("../../../app/reviews/[reviewId]/question/actions", () => ({
  saveQuestion: vi.fn().mockResolvedValue({ ok: true }),
}));

import { QuestionForm } from "@/components/question/QuestionForm";

describe("QuestionForm — acrônimos por framework", () => {
  it("SPIDER: mostra as iniciais marginais e a expansão do acrônimo", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "spider", question_text: "", fields: {} }}
      />,
    );
    expect(screen.getByTestId("framework-acronym")).toHaveTextContent(
      "Sample · Phenomenon of Interest · Design · Evaluation · Research type",
    );
    const glyphs = screen
      .getAllByTestId("field-glyph")
      .map((g) => g.textContent);
    expect(glyphs).toEqual(["S", "PI", "D", "E", "R"]);
    expect(screen.getByText("Amostra")).toBeInTheDocument();
  });

  it("PICO: expande o próprio acrônimo com suas iniciais", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "pico", question_text: "", fields: {} }}
      />,
    );
    expect(screen.getByTestId("framework-acronym")).toHaveTextContent(
      "Population · Intervention · Comparison · Outcome",
    );
    const glyphs = screen
      .getAllByTestId("field-glyph")
      .map((g) => g.textContent);
    expect(glyphs).toEqual(["P", "I", "C", "O"]);
  });

  it("Livre: sem iniciais e sem expansão de acrônimo", () => {
    render(
      <QuestionForm
        reviewId="r1"
        initial={{ framework: "free", question_text: "", fields: {} }}
      />,
    );
    expect(screen.queryByTestId("framework-acronym")).toBeNull();
    expect(screen.queryAllByTestId("field-glyph")).toHaveLength(0);
  });
});
