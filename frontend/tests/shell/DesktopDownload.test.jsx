import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesktopDownload, desktopVersion, DESKTOP_DOWNLOAD_URL } from '../../src/shell/DesktopDownload';

describe('Download app', () => {
  test('offers the Windows installer and the address to enter', () => {
    render(<DesktopDownload />);
    expect(screen.getByRole('link', { name: /download for windows/i })).toHaveAttribute('href', DESKTOP_DOWNLOAD_URL);
    expect(screen.getByRole('button', { name: 'Copy this address' })).toHaveTextContent(window.location.origin);
  });

  test('knows when it runs inside the desktop app', () => {
    expect(desktopVersion('Mozilla/5.0 Chrome/130 BulkPostingDesktop/1.0.0')).toBe('1.0.0');
    expect(desktopVersion('Mozilla/5.0 Chrome/130')).toBeNull();
  });
});
