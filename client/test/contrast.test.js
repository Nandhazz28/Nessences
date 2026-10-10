import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reads the real design tokens so a palette edit that breaks WCAG fails here, not in a user's eyes.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const token = (n) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [hi, lo] = [lum(token(a)), lum(token(b))].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('colour contrast (WCAG 2.2 AA)', () => {
  it.each([['ink', 'paper'], ['ink', 'sand'], ['muted', 'paper'], ['muted', 'sand'], ['oxblood', 'paper'], ['oxblood', 'sand'], ['paper', 'ink'], ['paper', 'oxblood']])('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each([['control', 'paper'], ['control', 'sand']])('control boundary %s on %s is at least 3:1 (1.4.11)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
  it('stone is reserved for decoration: it must not be what draws a control (documents why --color-control exists)', () => {
    expect(ratio('stone', 'paper')).toBeLessThan(3);
    expect(css).toMatch(/\.field\s*\{[^}]*var\(--color-control\)/);
  });
});
