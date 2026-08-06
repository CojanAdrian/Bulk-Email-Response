import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import UploadPanel from '../../src/components/UploadPanel';
import * as loadsApi from '../../src/api/loads';

vi.mock('papaparse');
vi.mock('../../src/api/loads');

function makeFile(name = 'loads.csv') {
  return new File(['irrelevant'], name, { type: 'text/csv' });
}

const VALID_FIELDS = [
  'Order', 'Origin City', 'Origin State', 'Dest City', 'Dest State',
  'Equip Type', 'Weight', 'Target Pay', 'Early P/U Dt', 'Late P/U Dt', 'Planning Comment',
];

function validRow() {
  return {
    Order: '0078033',
    'Origin City': 'NEWPORT',
    'Origin State': 'AR',
    'Dest City': 'O FALLON',
    'Dest State': 'MO',
    'Equip Type': 'FGT',
    Weight: '12845.0 LB',
    'Target Pay': '$1,100.00',
    'Early P/U Dt': '07/01/2026 1200',
    'Late P/U Dt': '07/01/2026 1200',
    'Planning Comment': '1p1d / $90 LUMP AT DEL',
  };
}

describe('UploadPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('parses a valid CSV and uploads the resulting loads', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [validRow()] });
    });
    loadsApi.uploadLoads.mockResolvedValue({ inserted: 1, updated: 0 });
    const onUploadComplete = vi.fn();
    render(<UploadPanel onUploadComplete={onUploadComplete} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(loadsApi.uploadLoads).toHaveBeenCalledTimes(1);
    });
    const [loads] = loadsApi.uploadLoads.mock.calls[0];
    expect(loads).toHaveLength(1);
    expect(loads[0].load_number).toBe('0078033');
    expect(loads[0].equipment).toBe('V');

    await waitFor(() => {
      expect(screen.getByText(/uploaded: 1 new, 0 updated/i)).toBeInTheDocument();
    });
    expect(onUploadComplete).toHaveBeenCalled();
  });

  test('shows an error when required columns are missing, without calling the upload API', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: ['Order'] }, data: [{ Order: '123' }] });
    });
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/missing required column/i)).toBeInTheDocument();
    });
    expect(loadsApi.uploadLoads).not.toHaveBeenCalled();
  });

  test('shows an error when the upload request fails', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [validRow()] });
    });
    loadsApi.uploadLoads.mockRejectedValue(new Error('Internal server error'));
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
  });

  test('shows an error when the file has headers but no usable data rows', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({ meta: { fields: VALID_FIELDS }, data: [] });
    });
    render(<UploadPanel onUploadComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/upload loads csv/i), { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/no usable data rows/i)).toBeInTheDocument();
    });
    expect(loadsApi.uploadLoads).not.toHaveBeenCalled();
  });
});
