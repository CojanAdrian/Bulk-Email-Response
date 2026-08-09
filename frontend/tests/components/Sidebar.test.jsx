import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../../src/components/Sidebar';

describe('Sidebar', () => {
  test('renders both nav items and the username', () => {
    render(<Sidebar tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^loads$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  test('marks the active tab with aria-current', () => {
    render(<Sidebar tab="inquiries" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^inquiries$/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /^loads$/i })).not.toHaveAttribute('aria-current');
  });

  test('calls onTabChange with the clicked tab', () => {
    const onTabChange = vi.fn();
    render(<Sidebar tab="loads" onTabChange={onTabChange} username="admin" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^inquiries$/i }));
    expect(onTabChange).toHaveBeenCalledWith('inquiries');
  });

  test('calls onLogout when the log out button is clicked', () => {
    const onLogout = vi.fn();
    render(<Sidebar tab="loads" onTabChange={vi.fn()} username="admin" onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  test('renders the theme toggle', () => {
    render(<Sidebar tab="loads" onTabChange={vi.fn()} username="admin" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: /switch to (dark|light) theme/i })).toBeInTheDocument();
  });
});
