// tests/unit/prisma/prisma-flowchart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";
import type { PrismaFlowModel } from "@/lib/prisma/flow-model";

const model: PrismaFlowModel = {
  identified: 20,
  duplicatesRemoved: 5,
  screened: 15,
  excludedScreening: 6,
  assessedFullText: 9,
  excludedFullText: [],
  included: 5,
  partial: false,
};

describe("PrismaFlowchart", () => {
  it("renderiza o SVG com os números e os links de download", () => {
    render(<PrismaFlowchart reviewId="rev-1" model={model} />);
    expect(screen.getByLabelText("Fluxograma PRISMA 2020")).toBeInTheDocument();
    const svg = screen.getByRole("img", { name: "Fluxograma PRISMA 2020" });
    expect(svg.outerHTML).toContain("n = 20");
    expect(screen.getByRole("link", { name: /SVG/ })).toHaveAttribute(
      "href",
      "/reviews/rev-1/prisma/export?format=svg",
    );
    expect(screen.getByRole("link", { name: /PNG/ })).toHaveAttribute(
      "href",
      "/reviews/rev-1/prisma/export?format=png",
    );
  });

  it("mostra aviso de números parciais quando partial=true", () => {
    render(
      <PrismaFlowchart reviewId="rev-1" model={{ ...model, partial: true }} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/parci/i);
  });

  it("não mostra aviso quando os números são finais", () => {
    render(<PrismaFlowchart reviewId="rev-1" model={model} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
