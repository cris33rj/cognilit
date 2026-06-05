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

describe("ProtocolEditor — toggle Editar/Visualizar", () => {
  it("alterna para Visualizar: renderiza o markdown e esconde o textarea", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={"# Olá"}
        locked={false}
        canDraft
      />,
    );
    expect(
      screen.getByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Olá" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeNull();
  });

  it("protocolo travado abre em Visualizar por padrão", () => {
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={"# Travado"}
        locked
        canDraft={false}
      />,
    );
    expect(screen.getByRole("tab", { name: "Visualizar" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Travado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Conteúdo do protocolo (Markdown)"),
    ).toBeNull();
  });

  it("preview reflete a edição não salva do textarea (buffer vivo)", async () => {
    const user = userEvent.setup();
    render(
      <ProtocolEditor
        reviewId="r1"
        initialMarkdown={""}
        locked={false}
        canDraft
      />,
    );
    await user.type(
      screen.getByLabelText("Conteúdo do protocolo (Markdown)"),
      "# Rascunho vivo",
    );
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Rascunho vivo" }),
    ).toBeInTheDocument();
  });
});
