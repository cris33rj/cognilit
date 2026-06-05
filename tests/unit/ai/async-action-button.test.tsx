import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";

// Cria uma promise controlável: o teste decide quando ela resolve/rejeita.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AsyncActionButton", () => {
  it("mostra pendência (disabled + aria-busy + rótulo) durante a ação e restaura no sucesso", async () => {
    const user = userEvent.setup();
    const d = deferred<void>();
    const onRun = vi.fn(() => d.promise);

    render(
      <AsyncActionButton
        idleLabel="Derivar por IA"
        pendingLabel="Derivando…"
        onRun={onRun}
        className="btn-primary"
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Derivar por IA");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "false");

    await user.click(btn);

    // Em curso: desabilitado, aria-busy, rótulo de pendência, spinner presente.
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Derivando…");
    expect(btn.querySelector(".btn-spinner")).not.toBeNull();

    await act(async () => {
      d.resolve();
      await d.promise;
    });

    // Restaurado.
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveAttribute("aria-busy", "false");
    expect(btn).toHaveTextContent("Derivar por IA");
    expect(btn.querySelector(".btn-spinner")).toBeNull();
  });

  it("restaura o estado mesmo quando a ação rejeita (finally)", async () => {
    const user = userEvent.setup();
    const d = deferred<void>();
    const onRun = vi.fn(() => d.promise);

    render(
      <AsyncActionButton
        idleLabel="Rascunhar por IA"
        pendingLabel="Rascunhando…"
        onRun={onRun}
      />,
    );

    const btn = screen.getByRole("button");
    await user.click(btn);
    expect(btn).toBeDisabled();

    await act(async () => {
      d.reject(new Error("falha"));
      await d.promise.catch(() => {});
    });

    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(btn).toHaveTextContent("Rascunhar por IA");
    expect(btn).toHaveAttribute("aria-busy", "false");
  });

  it("respeita a prop disabled e não dispara onRun", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn(() => Promise.resolve());

    render(
      <AsyncActionButton
        idleLabel="Derivar por IA"
        pendingLabel="Derivando…"
        onRun={onRun}
        disabled
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });
});
