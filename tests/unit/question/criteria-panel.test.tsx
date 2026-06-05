import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Promise controlável para a action de IA.
let resolveDerive!: (v: { ok: true; notFound: false }) => void;
vi.mock("../../../app/reviews/[reviewId]/question/actions", () => ({
  deriveCriteria: vi.fn(
    () =>
      new Promise((res) => {
        resolveDerive = res;
      }),
  ),
  ratifyCriterion: vi.fn().mockResolvedValue({ ok: true }),
}));

import { CriteriaPanel } from "@/components/question/CriteriaPanel";

describe("CriteriaPanel — feedback do 'Derivar por IA'", () => {
  it("mostra 'Derivando…' enquanto processa e a mensagem ao concluir", async () => {
    const user = userEvent.setup();
    render(<CriteriaPanel reviewId="r1" criteria={[]} canDerive />);

    const btn = screen.getByRole("button", { name: "Derivar por IA" });
    await user.click(btn);

    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Derivando…");

    await act(async () => {
      resolveDerive({ ok: true, notFound: false });
    });

    await waitFor(() =>
      expect(screen.getByText("Sugestões geradas.")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Derivar por IA" }),
    ).not.toBeDisabled();
  });

  it("mantém o botão desabilitado quando canDerive é false", () => {
    render(<CriteriaPanel reviewId="r1" criteria={[]} canDerive={false} />);
    expect(
      screen.getByRole("button", { name: "Derivar por IA" }),
    ).toBeDisabled();
  });
});
