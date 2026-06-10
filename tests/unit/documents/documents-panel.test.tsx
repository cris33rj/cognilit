import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("DocumentsPanel (FR-004)", () => {
  it("lista os PDFs do estudo com seu estado", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([
      {
        id: "d1",
        filename: "estudo.pdf",
        byte_size: 2048,
        processing_status: "queued",
        created_at: "2026-06-09T00:00:00Z",
      },
    ]);
    const onAttach = vi.fn();
    wrap(
      <DocumentsPanel
        reviewId="r1"
        recordId="rec1"
        loadDocuments={loadDocuments}
        onAttach={onAttach}
      />,
    );
    expect(await screen.findByText("estudo.pdf")).toBeInTheDocument();
    expect(screen.getByText(/enfileirado/i)).toBeInTheDocument();
  });

  it("mostra mensagem quando o estudo não tem PDF", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([]);
    wrap(
      <DocumentsPanel
        reviewId="r1"
        recordId="rec1"
        loadDocuments={loadDocuments}
        onAttach={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/nenhum pdf anexado/i)).toBeInTheDocument(),
    );
  });

  it("desabilita o anexo quando nenhum estudo está selecionado", () => {
    wrap(
      <DocumentsPanel
        reviewId="r1"
        recordId={null}
        loadDocuments={vi.fn()}
        onAttach={vi.fn()}
      />,
    );
    expect(screen.getByText(/selecione um registro/i)).toBeInTheDocument();
  });

  it("envia o arquivo e invalida a lista ao anexar com sucesso", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([]);
    const onAttach = vi.fn().mockResolvedValue({ ok: true });
    wrap(
      <DocumentsPanel
        reviewId="r1"
        recordId="rec1"
        loadDocuments={loadDocuments}
        onAttach={onAttach}
      />,
    );
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "a.pdf", {
      type: "application/pdf",
    });
    const input = screen.getByLabelText(/anexar pdf/i);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1));
    const fd = onAttach.mock.calls[0]?.[0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("recordId")).toBe("rec1");
    expect(fd.get("file")).toBeTruthy();
  });

  it("mostra erro quando o anexo falha", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([]);
    const onAttach = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        error: "Arquivo acima do limite de 50 MB.",
      });
    wrap(
      <DocumentsPanel
        reviewId="r1"
        recordId="rec1"
        loadDocuments={loadDocuments}
        onAttach={onAttach}
      />,
    );
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "a.pdf", {
      type: "application/pdf",
    });
    const input = screen.getByLabelText(/anexar pdf/i);
    fireEvent.change(input, { target: { files: [file] } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Arquivo acima do limite de 50 MB.");
  });
});
