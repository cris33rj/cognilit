import type { PrismaFlowModel } from "./flow-model";

const W = 520;
const BOX_W = 360;
const BOX_H = 56;
const X = (W - BOX_W) / 2;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function box(y: number, title: string, n: number): string {
  return (
    `<rect x="${X}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="#ffffff" stroke="#334155"/>` +
    `<text x="${W / 2}" y="${y + 22}" text-anchor="middle" font-size="13" fill="#0f172a">${esc(title)}</text>` +
    `<text x="${W / 2}" y="${y + 41}" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">n = ${n}</text>`
  );
}

function arrow(yFrom: number, yTo: number): string {
  return `<line x1="${W / 2}" y1="${yFrom}" x2="${W / 2}" y2="${yTo}" stroke="#334155" marker-end="url(#arrow)"/>`;
}

/** Template determinístico do fluxograma PRISMA 2020. Read-only (sem inputs). */
export function renderPrismaSvg(m: PrismaFlowModel): string {
  const gap = 34;
  let y = 20;
  const parts: string[] = [];

  const stack: [string, number][] = [
    ["Registros identificados", m.identified],
    ["Registros triados (T/R)", m.screened],
    ["Avaliados em texto completo", m.assessedFullText],
    ["Estudos incluídos", m.included],
  ];

  const positions: number[] = [];
  for (let i = 0; i < stack.length; i++) {
    positions.push(y);
    if (i > 0) parts.push(arrow(positions[i - 1]! + BOX_H, y));
    parts.push(box(y, stack[i]![0], stack[i]![1]));
    y += BOX_H + gap;
  }

  // Caixas laterais de remoção/exclusão (à direita), ligadas às etapas.
  const sideX = X + BOX_W + 24;
  const side = (yTop: number, lines: string[]): string => {
    const h = 24 + lines.length * 16;
    return (
      `<rect x="${sideX}" y="${yTop}" width="200" height="${h}" rx="6" fill="#f8fafc" stroke="#94a3b8"/>` +
      lines
        .map(
          (ln, i) =>
            `<text x="${sideX + 10}" y="${yTop + 18 + i * 16}" font-size="11" fill="#334155">${esc(ln)}</text>`,
        )
        .join("")
    );
  };

  parts.push(
    side(positions[0]! + BOX_H + 6, [
      `Duplicados removidos: n = ${m.duplicatesRemoved}`,
    ]),
  );
  parts.push(
    side(positions[1]! + BOX_H + 6, [
      `Excluídos (T/R): n = ${m.excludedScreening}`,
    ]),
  );
  const ftLines = m.excludedFullText.length
    ? [
        "Excluídos (TC), por motivo:",
        ...m.excludedFullText.map((e) => `• ${e.reason}: n = ${e.n}`),
      ]
    : ["Excluídos (TC): n = 0"];
  parts.push(side(positions[2]! + BOX_H + 6, ftLines));

  const totalH = y + 20 + (m.partial ? 24 : 0);
  const banner = m.partial
    ? `<text x="${W / 2}" y="${y + 6}" text-anchor="middle" font-size="12" fill="#b45309">Números parciais — triagem em andamento.</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 240} ${totalH}" ` +
    `role="img" aria-label="Fluxograma PRISMA 2020">` +
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">` +
    `<path d="M0,0 L6,3 L0,6 Z" fill="#334155"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    parts.join("") +
    banner +
    `</svg>`
  );
}
