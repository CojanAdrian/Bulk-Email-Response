import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { composeLoadText } from '../../src/lib/loadText';
import { stopCode, stopBadge, stopLine } from '../../src/lib/stopCount';

// The same examples the server's email reply is checked against, so Copy,
// Blast and the emailed reply can never say different things.
const examples = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../shared/reply-fixtures.json'), 'utf8'));

describe('load text matches the server reply', () => {
  test.each(examples.map((e) => [e.name, e]))('%s', (_name, example) => {
    expect(composeLoadText(example.load)).toBe(example.reply);
  });
});

describe('stop count', () => {
  const load = (o) => ({ comment: '', stops: 0, extra_stops: null, ...o });

  test.each([
    ['1p2d / $98 LUMP', '1P/2D'],
    ['2p1d / $92 LUMP AT DEL', '2P/1D'],
    ['1P2D - PU AT A CONVENTION CENTER', '1P/2D'],
    ['1p/2d PRECOOL 38', '1P/2D'],
    ['2P/1D / Reefer', '2P/1D'],
    ['1 pick 3 drops', '1P/3D'],
    ['1pu 4del', '1P/4D'],
  ])('reads "%s" as %s', (comment, code) => {
    expect(stopCode(load({ comment }))).toBe(code);
  });

  test('a 1p1d load is not multi-stop', () => {
    expect(stopCode(load({ comment: '1p1d / straps or loadbars / dry' }))).toBeNull();
  });

  test('McLeod stops count the extra stops', () => {
    expect(stopCode(load({ stops: 1 }))).toBe('MULTI-STOP');
    expect(stopLine(load({ stops: 2 }))).toBe('Stops: 4 stops');
  });

  test('entered extra stops win over the comment', () => {
    const extra = [{ type: 'delivery', city: 'Joliet', state: 'IL' }, { type: 'delivery', city: 'Peoria', state: 'IL' }];
    expect(stopCode(load({ comment: '1p2d', extra_stops: extra }))).toBe('1P/3D');
  });

  test('badges name the kind and the count', () => {
    expect(stopBadge(load({ comment: '1p2d' }))).toBe('MULTI-DROP · 1P/2D');
    expect(stopBadge(load({ comment: '2p1d' }))).toBe('MULTI-PICK · 2P/1D');
    expect(stopBadge(load({ comment: '2p2d' }))).toBe('MULTI-PICK & DROP · 2P/2D');
    expect(stopBadge(load({ comment: 'multi-drop load' }))).toBe('MULTI-DROP');
  });
});
