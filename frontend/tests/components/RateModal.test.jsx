import { describe, test, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RateModal from '../../src/components/RateModal';
import * as loadsApi from '../../src/api/loads';

vi.mock('../../src/api/loads');

const LOAD = { id: 1, load_number: 'L1001', target_pay: '1500.00', status: 'active' };

const BLANK_EXTRA_FIELDS = {
  origin_city: null, origin_state: null, origin_zip: null,
  dest_city: null, dest_state: null, dest_zip: null,
  equipment: null, weight: null, commodity: null, temperature: null, comment: null,
  stops: null, custom_reply_body: null,
};

describe('RateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('saves the updated target pay and status, then closes', async () => {
    loadsApi.updateLoad.mockResolvedValue({ ...LOAD, target_pay: '1700', status: 'booked' });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/target pay/i), { target: { value: '1700' } });
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'booked' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, { ...BLANK_EXTRA_FIELDS, target_pay: 1700, status: 'booked' });
      expect(onSaved).toHaveBeenCalledWith({ ...LOAD, target_pay: '1700', status: 'booked' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('saves edits to route, equipment, and cargo fields alongside rate and status', async () => {
    const fullLoad = {
      id: 5, load_number: 'L5005', origin_city: 'Dallas', origin_state: 'TX', origin_zip: '75201',
      dest_city: 'Chicago', dest_state: 'IL', dest_zip: '60601', equipment: 'V', weight: '40000',
      commodity: 'General', temperature: null, stops: 0, comment: 'Call ahead', target_pay: '1500.00', status: 'active',
    };
    loadsApi.updateLoad.mockResolvedValue({ ...fullLoad, dest_city: 'Milwaukee', status: 'covered' });
    render(<RateModal load={fullLoad} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/dest city/i), { target: { value: 'Milwaukee' } });
    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'covered' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(5, {
        origin_city: 'Dallas', origin_state: 'TX', origin_zip: '75201',
        dest_city: 'Milwaukee', dest_state: 'IL', dest_zip: '60601',
        equipment: 'V', weight: '40000', commodity: 'General', temperature: null, comment: 'Call ahead',
        stops: 0, target_pay: 1500, status: 'covered', custom_reply_body: null,
      });
    });
  });

  test('toggling "Use a custom reply" on prefills the textarea from the preview-reply endpoint', async () => {
    loadsApi.previewLoadReply.mockResolvedValue({ body: 'PU: DALLAS, TX\nDEL: CHICAGO, IL\nRate: $1,500' });
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/use a custom reply/i));

    await waitFor(() => {
      expect(loadsApi.previewLoadReply).toHaveBeenCalledWith(1);
      expect(screen.getByLabelText(/custom reply text/i)).toHaveValue('PU: DALLAS, TX\nDEL: CHICAGO, IL\nRate: $1,500');
    });
  });

  test('does not fetch a preview when the load already has a custom_reply_body', async () => {
    const loadWithCustomReply = { ...LOAD, custom_reply_body: 'Already customized text' };
    render(<RateModal load={loadWithCustomReply} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText(/use a custom reply/i)).toBeChecked();
    expect(screen.getByLabelText(/custom reply text/i)).toHaveValue('Already customized text');
    expect(loadsApi.previewLoadReply).not.toHaveBeenCalled();
  });

  test('saves the edited custom reply text as custom_reply_body', async () => {
    loadsApi.previewLoadReply.mockResolvedValue({ body: 'PU: DALLAS, TX' });
    loadsApi.updateLoad.mockResolvedValue({ ...LOAD, custom_reply_body: 'PU: DALLAS, TX\n2nd PU: FORT WORTH, TX' });
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/use a custom reply/i));
    await waitFor(() => screen.getByDisplayValue('PU: DALLAS, TX'));

    fireEvent.change(screen.getByLabelText(/custom reply text/i), {
      target: { value: 'PU: DALLAS, TX\n2nd PU: FORT WORTH, TX' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, {
        ...BLANK_EXTRA_FIELDS,
        target_pay: 1500,
        status: 'active',
        custom_reply_body: 'PU: DALLAS, TX\n2nd PU: FORT WORTH, TX',
      });
    });
  });

  test('unchecking "Use a custom reply" clears custom_reply_body on save', async () => {
    const loadWithCustomReply = { ...LOAD, custom_reply_body: 'Old custom text' };
    loadsApi.updateLoad.mockResolvedValue({ ...loadWithCustomReply, custom_reply_body: null });
    render(<RateModal load={loadWithCustomReply} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/use a custom reply/i));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(1, {
        ...BLANK_EXTRA_FIELDS,
        target_pay: 1500,
        status: 'active',
        custom_reply_body: null,
      });
    });
  });

  test('rejects a non-integer stops value without calling the API', async () => {
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^stops$/i), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/stops must be a whole number/i)).toBeInTheDocument();
    });
    expect(loadsApi.updateLoad).not.toHaveBeenCalled();
  });

  test('sends null instead of an empty string when target pay is left blank', async () => {
    const blankRateLoad = { id: 2, load_number: 'L2002', target_pay: null, status: 'active' };
    loadsApi.updateLoad.mockResolvedValue({ ...blankRateLoad, status: 'booked' });
    render(<RateModal load={blankRateLoad} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'booked' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(loadsApi.updateLoad).toHaveBeenCalledWith(2, { ...BLANK_EXTRA_FIELDS, target_pay: null, status: 'booked' });
    });
  });

  test('shows a validation error and does not call the API when target pay is not a number', async () => {
    // A `type="number"` input sanitizes any non-numeric value back to '' at the DOM
    // level (this is real HTML behavior, not a jsdom quirk - browsers block typing
    // non-numeric characters into these inputs the same way), so a non-numeric string
    // can't be produced by firing a change event on the input itself. It can still
    // reach handleSave via bad data coming from the API (e.g. a corrupt/legacy
    // target_pay value) that the user never touches, which is what this exercises.
    const badRateLoad = { id: 3, load_number: 'L3003', target_pay: 'not-a-number', status: 'active' };
    render(<RateModal load={badRateLoad} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/target pay must be a number/i)).toBeInTheDocument();
    });
    expect(loadsApi.updateLoad).not.toHaveBeenCalled();
  });

  test('disables the Save button while the save request is in flight', async () => {
    let resolveSave;
    loadsApi.updateLoad.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });

    resolveSave({ ...LOAD, status: 'active' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
    });
  });

  test('closes when the Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('shows an error and keeps the modal open when saving fails', async () => {
    loadsApi.updateLoad.mockRejectedValue(new Error('Internal server error'));
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('calls onClose without saving when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<RateModal load={LOAD} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(loadsApi.updateLoad).not.toHaveBeenCalled();
  });

  test('does not update state after unmounting while a save is in flight', async () => {
    let resolveSave;
    loadsApi.updateLoad.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const onSaved = vi.fn();
    const { unmount } = render(<RateModal load={LOAD} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    unmount();
    resolveSave({ ...LOAD, status: 'active' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSaved).not.toHaveBeenCalled();
  });

  // Regression test: see GmailConnectionPanel.test.jsx's StrictMode test for
  // the full explanation. Here the same stale-ref bug would have made
  // onSaved/onClose never fire after a real click, leaving the button stuck
  // on "Saving..." forever in development.
  test('calling onSaved/onClose after Save still works under React StrictMode\'s dev-only double-mount', async () => {
    loadsApi.updateLoad.mockResolvedValue({ ...LOAD, target_pay: '1700', status: 'booked' });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <RateModal load={LOAD} onClose={onClose} onSaved={onSaved} />
      </StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
