import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import SettingsSheet from '../../src/shell/SettingsSheet';
import { SettingsProvider, DEFAULT_SETTINGS } from '../../src/shell/SettingsContext';
import * as settingsApi from '../../src/api/settings';
import * as authApi from '../../src/api/auth';
import * as gmailApi from '../../src/api/gmail';
import * as liveSocket from '../../src/lib/liveSocket';

vi.mock('../../src/api/settings');
vi.mock('../../src/api/auth');
vi.mock('../../src/api/gmail');
vi.mock('../../src/lib/liveSocket');

function renderSheet(section, props = {}) {
  const handlers = { onSection: vi.fn(), onClose: vi.fn(), onLogout: vi.fn() };
  render(
    <SettingsProvider>
      <SettingsSheet section={section} username="adrian" {...handlers} {...props} />
    </SettingsProvider>
  );
  return handlers;
}

describe('SettingsSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settingsApi.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    settingsApi.updateSettings.mockImplementation((change) => Promise.resolve(change));
    gmailApi.getGmailStatus.mockResolvedValue({ connected: true, gmailAddress: 'me@igt.com', signature: 'Adrian' });
    liveSocket.subscribe.mockReturnValue(() => {});
  });

  test('shows the chosen section and lets you switch', () => {
    const { onSection } = renderSheet('targets');
    expect(screen.getByRole('heading', { name: 'Targets' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(onSection).toHaveBeenCalledWith('notifications');
  });

  test('a target is changed with the stepper and saved at once', async () => {
    renderSheet('targets');
    await waitFor(() => expect(settingsApi.getSettings).toHaveBeenCalled());
    const group = screen.getByRole('group', { name: 'loads per day' });
    expect(within(group).getByText('8 loads')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'More loads per day' }));
    expect(within(group).getByText('9 loads')).toBeInTheDocument();
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({ targets: { loadsPerDay: 9 } });
  });

  test('a setting that fails to save goes back and says so', async () => {
    settingsApi.updateSettings.mockRejectedValue(new Error('Network error'));
    renderSheet('appearance');
    await waitFor(() => expect(settingsApi.getSettings).toHaveBeenCalled());
    const map = screen.getByRole('switch', { name: 'Show the map' });
    fireEvent.click(map);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(map).toHaveAttribute('aria-checked', 'true');
  });

  test('the password is changed when both new entries match', async () => {
    authApi.changePassword.mockResolvedValue({ ok: true });
    renderSheet('profile');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-secret' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(authApi.changePassword).toHaveBeenCalledWith('old-secret', 'new-secret-1'));
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  test('mismatched new passwords are refused before asking the server', () => {
    renderSheet('profile');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(authApi.changePassword).not.toHaveBeenCalled();
  });

  test('the opening screen is a per-user setting', async () => {
    renderSheet('board');
    await waitFor(() => expect(settingsApi.getSettings).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('radio', { name: 'Inquiries' }));
    expect(settingsApi.updateSettings).toHaveBeenCalledWith({ board: { openingTab: 'inquiries' } });
  });

  test('the Gmail section edits the reply signature', async () => {
    gmailApi.setSignature.mockResolvedValue({ connected: true, gmailAddress: 'me@igt.com', signature: 'Adrian Cojan' });
    renderSheet('gmail');
    const field = await screen.findByLabelText('Signature');
    expect(field).toHaveValue('Adrian');
    fireEvent.change(field, { target: { value: 'Adrian Cojan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save signature' }));
    await waitFor(() => expect(gmailApi.setSignature).toHaveBeenCalledWith('Adrian Cojan'));
  });

  test('Escape and the close button close it; Sign out signs out', () => {
    const { onClose, onLogout } = renderSheet('targets');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalled();
  });
});
