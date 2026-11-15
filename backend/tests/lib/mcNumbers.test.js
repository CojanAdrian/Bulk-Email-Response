const { findAllMcs, stripQuoted, candidateMcs, normalizeMc } = require('../../src/lib/mcNumbers');

describe('mcNumbers', () => {
  test.each([
    ['MC# 689501', '689501'],
    ['MC#689501', '689501'],
    ['MC 689501', '689501'],
    ['MC-689501', '689501'],
    ['M.C. #689501', '689501'],
    ['MC Number: 689501', '689501'],
    ['MC No. 0689501', '689501'],
  ])('reads %s', (text, mc) => {
    expect(findAllMcs(text)).toEqual([mc]);
  });

  test('does not read phone numbers or load numbers as MC#s', () => {
    expect(findAllMcs('Call 312-555-0100 about load 0094249')).toEqual([]);
  });

  test('drops quoted history', () => {
    const body = 'Is it available? MC 111111\n\nOn Mon, Nov 3, 2026 at 9:00 AM Kenny <k@igt.com> wrote:\n> our MC 222222';
    expect(stripQuoted(body)).not.toContain('222222');
  });

  test('orders candidates: subject, then this message, then quoted history', () => {
    const body = 'We can do it. MC# 333333\n\nOn Mon, Nov 3, 2026 at 9:00 AM Kenny <k@igt.com> wrote:\n> IGT MC 444444';
    expect(candidateMcs('Re: 0094249 MC 555555', body)).toEqual(['555555', '333333', '444444']);
  });

  test('normalizes leading zeros', () => {
    expect(normalizeMc('00123')).toBe('123');
  });
});
