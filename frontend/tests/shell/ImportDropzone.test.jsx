import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportDropzone from '../../src/shell/ImportDropzone';
import * as importer from '../../src/lib/importLoads';

vi.mock('../../src/lib/importLoads', async (original) => ({ ...(await original()), importLoads: vi.fn() }));

const CSV = 'Order,Origin City\n1,Chicago\n';
const file = () => new File([CSV], 'board.csv', { type: 'text/csv' });
const fileTransfer = (files) => ({ types: ['Files'], files });

function paste(target, clipboardData) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = clipboardData;
  target.dispatchEvent(event);
}

describe('ImportDropzone', () => {
  let onImported;
  let onError;

  beforeEach(() => {
    vi.resetAllMocks();
    importer.importLoads.mockResolvedValue({ inserted: 3, updated: 39 });
    onImported = vi.fn();
    onError = vi.fn();
    render(
      <>
        <ImportDropzone onImported={onImported} onError={onError} />
        <input aria-label="search" />
      </>
    );
  });

  test('shows the drop target while a file is dragged over the window, and hides it on leave', () => {
    const overlay = screen.getByText(/drop to build your board/i).parentElement;
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    fireEvent.dragEnter(window, { dataTransfer: fileTransfer([]) });
    expect(overlay).toHaveAttribute('aria-hidden', 'false');
    fireEvent.dragLeave(window, { dataTransfer: fileTransfer([]) });
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });

  test('ignores a drag that carries no files, such as selected text', () => {
    fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(screen.getByText(/drop to build your board/i).parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  test('imports a dropped file and reports the result with its name', async () => {
    const dropped = file();
    fireEvent.drop(window, { dataTransfer: fileTransfer([dropped]) });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ inserted: 3, updated: 39 }, 'board.csv'));
    expect(importer.importLoads).toHaveBeenCalledWith(dropped);
  });

  test('leaves a drop alone when something else already handled it', () => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    event.dataTransfer = fileTransfer([file()]);
    event.preventDefault();
    window.dispatchEvent(event);
    expect(importer.importLoads).not.toHaveBeenCalled();
  });

  test('imports a pasted file', async () => {
    paste(document.body, { files: [file()], getData: () => '' });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ inserted: 3, updated: 39 }, 'board.csv'));
  });

  test('imports pasted CSV text', async () => {
    paste(document.body, { files: [], getData: () => CSV });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ inserted: 3, updated: 39 }, 'Pasted loads'));
    expect(importer.importLoads).toHaveBeenCalledWith(CSV);
  });

  test('does not treat ordinary pasted text as an import', () => {
    paste(document.body, { files: [], getData: () => '0084341' });
    expect(importer.importLoads).not.toHaveBeenCalled();
  });

  test('does not hijack a paste into a text field', () => {
    paste(screen.getByLabelText('search'), { files: [], getData: () => CSV });
    expect(importer.importLoads).not.toHaveBeenCalled();
  });

  test('reports a failed import', async () => {
    importer.importLoads.mockRejectedValue(new Error('The file is missing required column(s): weight'));
    fireEvent.drop(window, { dataTransfer: fileTransfer([file()]) });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('The file is missing required column(s): weight'));
  });
});
