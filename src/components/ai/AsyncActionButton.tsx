"use client";

import { useState } from "react";

export function AsyncActionButton({
  onRun,
  idleLabel,
  pendingLabel,
  disabled = false,
  title,
  className,
}: {
  /** Ação assíncrona disparada pelo clique. O botão fica pendente até resolver/rejeitar. */
  onRun: () => Promise<void>;
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending}
      title={title}
      onClick={async () => {
        setPending(true);
        try {
          await onRun();
        } catch {
          // onRun é dono do tratamento de erro (os call-sites leem o resultado e
          // exibem a própria mensagem). Engolimos aqui só para o handler de evento
          // não emitir uma unhandled rejection; o estado de pendência é restaurado
          // no finally de qualquer forma.
        } finally {
          setPending(false);
        }
      }}
      className={className}
    >
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
