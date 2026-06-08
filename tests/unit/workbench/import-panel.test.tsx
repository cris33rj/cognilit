import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportPanel } from "@/components/workbench/ImportPanel";

// As server actions importadas pelo painel não devem rodar no jsdom.
vi.mock("../../../app/reviews/[reviewId]/workbench/actions", () => ({
  enqueueImport: vi.fn(),
  runImportWorker: vi.fn(),
}));
// JobProgress usa o client Supabase do browser — stub para isolar o painel.
vi.mock("@/components/workbench/JobProgress", () => ({
  JobProgress: () => null,
}));

const RIS_TWO = [
  "TY  - JOUR",
  "TI  - Estudo Um",
  "PY  - 2020",
  "ER  - ",
  "TY  - JOUR",
  "TI  - Estudo Dois",
  "PY  - 2021",
  "ER  - ",
  "",
].join("\n");

describe("ImportPanel — seed da string de busca", () => {
  it("pré-preenche 'String de busca' com suggestedQuery", () => {
    render(
      <ImportPanel reviewId="r1" suggestedQuery="active learning OR flipped" />,
    );
    expect(screen.getByPlaceholderText("String de busca")).toHaveValue(
      "active learning OR flipped",
    );
  });

  it("deixa 'String de busca' vazia quando não há seed", () => {
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);
    expect(screen.getByPlaceholderText("String de busca")).toHaveValue("");
  });
});

describe("ImportPanel — controle de arquivo e hits", () => {
  it("preenche 'Nº de hits' com a contagem de registros do arquivo", async () => {
    const user = userEvent.setup();
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);

    const file = new File([RIS_TWO], "busca.ris", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>("#import-file")!;
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Nº de hits")).toHaveValue(2),
    );
  });

  it("mostra o nome do arquivo escolhido no controle", async () => {
    const user = userEvent.setup();
    render(<ImportPanel reviewId="r1" suggestedQuery="" />);

    const file = new File([RIS_TWO], "busca.ris", { type: "text/plain" });
    const input = document.querySelector<HTMLInputElement>("#import-file")!;
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByText("busca.ris")).toBeInTheDocument(),
    );
  });
});
