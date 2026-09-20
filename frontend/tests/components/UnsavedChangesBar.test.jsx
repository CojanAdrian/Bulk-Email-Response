import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UnsavedChangesBar from '../../src/components/UnsavedChangesBar';

describe('UnsavedChangesBar', () => {
  test('renders the prompt and both actions', () => {
    render(<UnsavedChangesBar onDiscard={vi.fn()} onKeepEditing={vi.fn()} />);
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
  });

  test('calls onDiscard when Discard is clicked', () => {
    const onDiscard = vi.fn();
    render(<UnsavedChangesBar onDiscard={onDiscard} onKeepEditing={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test('calls onKeepEditing when Keep editing is clicked', () => {
    const onKeepEditing = vi.fn();
    render(<UnsavedChangesBar onDiscard={vi.fn()} onKeepEditing={onKeepEditing} />);
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });
});
