import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseRail } from "@/components/shell/PhaseRail";
import { PrismaBar } from "@/components/shell/PrismaBar";
import type { Phase } from "@/lib/shell/phases";
import type { PrismaCounters } from "@/lib/prisma/queries";

const phases: Phase[] = [
  {
    key: "question",
    label: "Pergunta",
    href: "/reviews/r/question",
    status: "done",
  },
  {
    key: "protocol",
    label: "Protocolo",
    href: "/reviews/r/protocol",
    status: "locked",
  },
  {
    key: "screening_ts",
    label: "Triagem T/R",
    href: "/reviews/r/workbench?mode=title_abstract",
    status: "current",
  },
  {
    key: "risk_of_bias",
    label: "Risco de Viés",
    href: null,
    status: "optional_off",
  },
];

const counters: PrismaCounters = {
  identified: 100,
  duplicates: 12,
  screened: 40,
  includedTs: 25,
  excludedTs: 15,
  maybeTs: 5,
  passedTs: 50,
  includedFt: 10,
  excludedFt: 15,
};

describe("PhaseRail", () => {
  it("marca a fase atual com aria-current e mostra o estado de cada fase", () => {
    render(<PhaseRail phases={phases} />);
    const current = screen.getByText("Triagem T/R").closest("[aria-current]");
    expect(current).not.toBeNull();
    expect(screen.getByText("Protocolo").closest("li")).toHaveAttribute(
      "data-status",
      "locked",
    );
    expect(screen.getByText("Risco de Viés").closest("li")).toHaveAttribute(
      "data-status",
      "optional_off",
    );
  });
});

describe("PrismaBar", () => {
  it("exibe os contadores PRISMA com aria-live", () => {
    const { container } = render(<PrismaBar counters={counters} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText("Identificados").parentElement).toHaveTextContent(
      "100",
    );
    expect(screen.getByText("Duplicados").parentElement).toHaveTextContent(
      "12",
    );
    expect(screen.getByText("Incluídos (TC)").parentElement).toHaveTextContent(
      "10",
    );
  });

  it("Incluídos (T/R) usa o cumulativo passedTs (não o inventário includedTs)", () => {
    render(<PrismaBar counters={counters} />);
    expect(screen.getByText("Incluídos (T/R)").parentElement).toHaveTextContent(
      "50",
    );
  });

  it("exibe Excluídos (T/R) a partir de excludedTs", () => {
    render(<PrismaBar counters={counters} />);
    expect(screen.getByText("Excluídos (T/R)").parentElement).toHaveTextContent(
      "15",
    );
  });
});
