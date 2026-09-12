import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../../src/components/BottomSheet';

describe('BottomSheet', () => {
  test('renders its children inside a dialog', () => {
    render(<BottomSheet onClose={vi.fn()}>Sheet content</BottomSheet>);
    expect(screen.getByRole('dialog')).toHaveTextContent('Sheet content');
  });

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose}>content</BottomSheet>);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not call onClose when the panel itself is clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose}>content</BottomSheet>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders a drag-handle indicator', () => {
    render(<BottomSheet onClose={vi.fn()}>content</BottomSheet>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
