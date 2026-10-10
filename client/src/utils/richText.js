// Parser for the CMS plain-text format used by site pages and journal articles. Pure and HTML-free:
//   "## Title" heading · "### Title" subheading · lines "a | b | c" (2+ consecutive, same column count) table
//   "1. item" ordered list · "- item" bullet list · blank line separates paragraphs · single newline inside a paragraph = line break.
// Output is a block list that React renders as text nodes, so content can never inject markup or scripts.
export function parseRichText(input) {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = []; let cur = null;
  const flush = () => {
    if (!cur) return;
    if (cur.type === 'table' && cur.rows.length < 2) blocks.push({ type: 'p', lines: cur.rows.map((r) => r.join(' | ')) }); // a lone "a | b" line is just text
    else blocks.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trim(); let m;
    if (!line) { flush(); continue; }
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) { flush(); blocks.push({ type: m[1].length === 2 ? 'h2' : 'h3', text: m[2] }); continue; }
    if ((m = /^\d+\.\s+(.+)$/.exec(line))) { if (cur?.type !== 'ol') { flush(); cur = { type: 'ol', items: [] }; } cur.items.push(m[1]); continue; }
    if ((m = /^[-•]\s+(.+)$/.exec(line))) { if (cur?.type !== 'ul') { flush(); cur = { type: 'ul', items: [] }; } cur.items.push(m[1]); continue; }
    if (line.includes(' | ')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cur?.type === 'table' && cur.rows[0].length === cells.length) { cur.rows.push(cells); continue; }
      if (cur?.type !== 'table') { flush(); cur = { type: 'table', rows: [cells] }; continue; }
      flush(); cur = { type: 'table', rows: [cells] }; continue;
    }
    if (cur?.type === 'p') cur.lines.push(line); else { flush(); cur = { type: 'p', lines: [line] }; }
  }
  flush();
  return blocks.map((b) => (b.type === 'table' ? { type: 'table', head: b.rows[0], rows: b.rows.slice(1) } : b));
}
// First paragraph-ish text, trimmed for meta descriptions.
export const excerptOf = (text, max = 155) => {
  const first = parseRichText(text).find((b) => b.type === 'p'); if (!first) return '';
  const s = first.lines.join(' '); return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};
