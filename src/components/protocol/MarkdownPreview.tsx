"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-serif text-2xl font-semibold text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-xl font-semibold text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-serif text-lg font-semibold text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="text-ink">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 text-ink">{children}</ul>,
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 text-ink">{children}</ol>
  ),
  li: ({ children }) => <li className="text-ink">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-3 text-ink-soft">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-deep underline"
    >
      {children}
    </a>
  ),
  code: ({ children }) => <code className="font-mono text-sm">{children}</code>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded bg-paper-2 p-3 font-mono text-sm text-ink">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <table className="w-full border-collapse text-sm text-ink">
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th className="border border-ink-faint px-2 py-1 text-left">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-ink-faint px-2 py-1">{children}</td>
  ),
};

export function MarkdownPreview({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm text-ink-soft">Sem conteúdo.</p>;
  }
  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Pré-visualização do protocolo"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
