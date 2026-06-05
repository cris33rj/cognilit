import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
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

const aiCriterion = {
  id: "c1",
  kind: "inclusion" as const,
  text: "Adultos",
  origin: "ai" as const,
  ratification_state: "pending" as const,
  ai_suggestion_id: "s1",
};

describe("CriteriaPanel — Fatia 11: regerar / confirmação / trava", () => {
  it("com critérios de IA presentes, o botão vira 'Regerar sugestões'", () => {
    render(<CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive />);
    expect(
      screen.getByRole("button", { name: "Regerar sugestões" }),
    ).toBeInTheDocument();
  });

  it("regerar pede confirmação; ao cancelar, não chama deriveCriteria", async () => {
    const { deriveCriteria } =
      await import("../../../app/reviews/[reviewId]/question/actions");
    (deriveCriteria as ReturnType<typeof vi.fn>).mockClear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Regerar sugestões" }),
      );
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deriveCriteria).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("travado: botão desabilitado e nota apontando emenda", () => {
    render(
      <CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive locked />,
    );
    expect(
      screen.getByRole("button", { name: "Regerar sugestões" }),
    ).toBeDisabled();
    expect(screen.getByText(/emenda do protocolo/i)).toBeInTheDocument();
  });
});
