import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

// Reads tokens.css and checks every text-on-background pair the app relies
// on meets WCAG AA (4.5:1) in both themes. Catches regressions like lime
// text on a white card.
const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8');

function parseBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('}', start);
  const block = css.slice(start, end);
  const tokens = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return tokens;
}

const light = parseBlock(':root');
const dark = { ...light, ...parseBlock('.dark') };

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS = [
  ['text', 'surface'],
  ['text-muted', 'surface'],
  ['text', 'surface-alt'],
  ['text-muted', 'surface-alt'],
  ['shell-text', 'shell-bg'],
  ['shell-text-muted', 'shell-bg'],
  ['shell-text', 'shell-surface'],
  ['shell-text-muted', 'shell-surface'],
  ['accent-ink', 'accent'],
  ['accent-ink', 'accent-strong'],
  ['gold-ink', 'gold'],
  ['gold-ink', 'gold-soft'],
  ['gold-text', 'gold-surface'],
  ['text', 'gold-surface'],
  ['success', 'success-bg'],
  ['error', 'error-bg'],
  ['warning', 'warning-bg'],
  ['tag', 'tag-bg'],
  ['info', 'info-bg'],
  ['text', 'field'],
  ['text-muted', 'field'],
  ['text', 'control'],
  ['text-muted', 'control'],
  ['success', 'surface'],
  ['error', 'surface'],
  ['info', 'surface'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, tokens) => {
  test.each(PAIRS)('%s on %s meets WCAG AA', (fg, bg) => {
    expect(tokens[fg], `missing token ${fg}`).toBeDefined();
    expect(tokens[bg], `missing token ${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
