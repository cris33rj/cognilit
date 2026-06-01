export type ProtocolContent =
  | { contentMarkdown: string }
  | { sections: Record<string, string> }
  | Record<string, never>;

export function protocolToMarkdown(content: ProtocolContent): string {
  if ("contentMarkdown" in content && content.contentMarkdown) {
    return content.contentMarkdown;
  }
  if ("sections" in content && content.sections) {
    const body = Object.entries(content.sections)
      .map(([k, v]) => `## ${k}\n\n${v}\n`)
      .join("\n");
    return `# Protocolo PRISMA-P\n\n${body}`;
  }
  return `# Protocolo PRISMA-P\n\n(Sem conteúdo.)\n`;
}
