import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { InstallApp } from '../../src/shell/InstallApp';
import { setInstallOffer } from '../../src/lib/installApp';

describe('Install app', () => {
  afterEach(() => act(() => setInstallOffer(null)));

  test('without a browser offer it explains how to install from the menu', () => {
    render(<InstallApp />);
    expect(screen.queryByRole('button', { name: 'Install BulkPosting' })).not.toBeInTheDocument();
    expect(screen.getByText('Install from your browser’s menu')).toBeInTheDocument();
  });

  test('with the browser offer, one click opens the install prompt', async () => {
    const offer = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) };
    render(<InstallApp />);
    act(() => setInstallOffer(offer));
    fireEvent.click(screen.getByRole('button', { name: 'Install BulkPosting' }));
    expect(offer.prompt).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install BulkPosting' })).not.toBeInTheDocument());
  });
});
