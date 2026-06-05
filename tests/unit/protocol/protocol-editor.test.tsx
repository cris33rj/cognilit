import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let resolveDraft!: (v: { ok: true }) => void;
vi.mock("../../../app/reviews/[reviewId]/protocol/actions", () => ({
  draftProtocol: vi.fn(
    () =>
      new Promise((res) => {
        resolveDraft = res;
      }),
  ),
  saveProtocolDraft: vi.fn().mockResolvedValue({ ok: true }),
  lockProtocol: vi.fn().mockResolvedValue({ ok: true }),
}));

import { ProtocolEditor } from "@/components/protocol/ProtocolEditor";

describe("ProtocolEditor — feedback do 'Rascunhar por IA'", () => {
  it("mostra 'Rascunhando…' enquanto processa e a mensagem ao concluir", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown=""
        locked={false}
        canDraft
      />,
    );

    const btn = screen.getByRole("button", { name: "Rascunhar por IA" });
    await user.click(btn);

    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Rascunhando…");

    await act(async () => {
      resolveDraft({ ok: true });
    });

    await waitFor(() =>
      expect(screen.getByText("Rascunho gerado pela IA.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Rascunhar por IA" }),
    ).not.toBeDisabled();
  });

  it("mantém 'Rascunhar por IA' desabilitado quando canDraft é false", () => {
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown=""
        locked={false}
        canDraft={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Rascunhar por IA" }),
    ).toBeDisabled();
  });
});
