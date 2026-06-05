import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "@/components/protocol/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renderiza markdown como HTML semântico (heading, item de lista, negrito)", () => {
    render(
      <MarkdownPreview markdown={"# Protocolo\n\n- item um\n\n**negrito**"} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Protocolo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("item um").closest("li")).not.toBeNull();
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("mostra placeholder discreto quando o conteúdo é vazio/só espaços", () => {
    render(<MarkdownPreview markdown={"   "} />);
    expect(screen.getByText("Sem conteúdo.")).toBeInTheDocument();
  });

  it("não materializa HTML cru como elemento ativo (anti-XSS, sem rehype-raw)", () => {
    const { container } = render(
      <MarkdownPreview markdown={'texto <img src=x onerror="alert(1)"> fim'} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
