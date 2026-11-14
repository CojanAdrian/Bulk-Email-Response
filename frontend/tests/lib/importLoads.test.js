import { describe, test, expect, vi, beforeEach } from 'vitest';
import { parseLoadsCsv, importLoads, looksLikeCsv } from '../../src/lib/importLoads';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const HEADER = 'Order,Origin City,Origin State,Dest City,Dest State,Equip Type,Weight,Target Pay,Early P/U Dt,Late P/U Dt,Planning Comment';
const ROW = '0078033,NEWPORT,AR,O FALLON,MO,FGT,12845.0 LB,"$1,100.00",07/01/2026 1200,07/01/2026 1200,1p1d';
const CSV = `${HEADER}\n${ROW}\n`;

describe('parseLoadsCsv', () => {
  test('reads loads from CSV text', async () => {
    const loads = await parseLoadsCsv(CSV);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ load_number: '0078033', origin_city: 'NEWPORT', dest_state: 'MO', target_pay: 1100 });
  });

  test('reads loads from a File', async () => {
    const loads = await parseLoadsCsv(new File([CSV], 'loads.csv', { type: 'text/csv' }));
    expect(loads[0].load_number).toBe('0078033');
  });

  test('names the missing columns', async () => {
    await expect(parseLoadsCsv('Order,Weight\n1,2\n')).rejects.toThrow(/missing required column\(s\): .*origin city/i);
  });

  test('rejects a file with headers but no rows', async () => {
    await expect(parseLoadsCsv(`${HEADER}\n`)).rejects.toThrow(/no usable data rows/i);
  });
});

describe('importLoads', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('uploads the parsed loads and reports each stage', async () => {
    loadsApi.uploadLoads.mockResolvedValue({ inserted: 1, updated: 0 });
    const onStage = vi.fn();
    const result = await importLoads(CSV, { onStage });
    expect(result).toEqual({ inserted: 1, updated: 0 });
    expect(loadsApi.uploadLoads).toHaveBeenCalledWith([expect.objectContaining({ load_number: '0078033' })]);
    expect(onStage.mock.calls.map((call) => call[0])).toEqual(['parsing', 'uploading']);
  });

  test('does not upload when the file cannot be parsed', async () => {
    await expect(importLoads('Order,Weight\n1,2\n')).rejects.toThrow(/missing required/i);
    expect(loadsApi.uploadLoads).not.toHaveBeenCalled();
  });

  test('says nothing was saved when the upload fails', async () => {
    loadsApi.uploadLoads.mockRejectedValue(new Error('Network error'));
    await expect(importLoads(CSV)).rejects.toThrow('Upload failed — no loads were saved. Network error');
  });
});

describe('looksLikeCsv', () => {
  test.each([
    [CSV, true],
    ['a\tb\n1\t2', true],
    ['just one line, with a comma', false],
    ['two lines\nno separators', false],
    ['', false],
    [null, false],
  ])('%j -> %s', (text, expected) => {
    expect(looksLikeCsv(text)).toBe(expected);
  });
});
