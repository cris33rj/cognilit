import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtractionFormBuilder } from "@/components/extraction/ExtractionFormBuilder";
import type { ExtractionFieldRow } from "@/lib/extraction/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const fields: ExtractionFieldRow[] = [
  {
    id: "f1",
    name: "Ano de publicação",
    type: "number",
    options: null,
    sort_order: 1,
  },
  {
    id: "f2",
    name: "Desenho do estudo",
    type: "select",
    options: ["RCT", "Coorte"],
    sort_order: 2,
  },
];

const noop = vi.fn().mockResolvedValue({ ok: true });

describe("ExtractionFormBuilder", () => {
  it("lista os campos em ordem com o rótulo do tipo em pt-BR", () => {
    render(
      <ExtractionFormBuilder
        reviewId="r1"
        fields={fields}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        onReorder={noop}
      />,
    );
    expect(screen.getByText("Ano de publicação")).toBeInTheDocument();
    expect(screen.getByText("Desenho do estudo")).toBeInTheDocument();
    expect(screen.getByText(/Número/)).toBeInTheDocument();
    expect(screen.getByText(/Escolha de lista/)).toBeInTheDocument();
  });

  it("chama onRemove com o id ao remover um campo", () => {
    const onRemove = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ExtractionFormBuilder
        reviewId="r1"
        fields={fields}
        onAdd={noop}
        onUpdate={noop}
        onRemove={onRemove}
        onReorder={noop}
      />,
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.click(screen.getAllByRole("button", { name: /remover/i })[0]!);
    expect(onRemove).toHaveBeenCalledWith("r1", "f1");
  });
});
