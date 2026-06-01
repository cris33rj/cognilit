import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportPreview } from "@/components/workbench/ImportPreview";

describe("ImportPreview", () => {
  it("renderiza títulos dos registros", () => {
    render(
      <ImportPreview
        records={[
          {
            title: "Estudo X",
            authors: ["A"],
            year: 2020,
            doi: null,
            abstract: null,
            language: null,
            raw: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Estudo X")).toBeInTheDocument();
  });

  it("não renderiza nada sem registros", () => {
    const { container } = render(<ImportPreview records={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
