import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModalCard from '../../src/components/ModalCard';

describe('ModalCard', () => {
  test('renders its children inside a scrollable inner body', () => {
    render(<ModalCard>Hello</ModalCard>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('the outer shell clips overflow (so a scrollbar can\'t poke past its rounded corners)', () => {
    render(<ModalCard>Hello</ModalCard>);
    const outer = screen.getByText('Hello').parentElement;
    expect(outer.className).toContain('overflow-hidden');
    expect(outer.className).toContain('rounded-3xl');
  });

  test('the inner body owns the scroll, inside a shell capped at maxHeight', () => {
    render(<ModalCard maxHeight="50vh">Hello</ModalCard>);
    const inner = screen.getByText('Hello');
    expect(inner.className).toContain('overflow-y-auto');
    expect(inner.parentElement).toHaveStyle({ maxHeight: '50vh' });
  });

  // The footer (Save / Cancel) lives outside the scrolling body on its own
  // solid background -- form content used to scroll *behind* a translucent
  // sticky footer and show through it.
  test('a footer renders outside the scrolling body, after it', () => {
    render(<ModalCard footer={<button type="button">Save</button>}>Hello</ModalCard>);
    const body = screen.getByText('Hello');
    const footer = screen.getByRole('button', { name: 'Save' }).parentElement;
    expect(body.contains(footer)).toBe(false);
    expect(footer.className).toContain('bg-surface');
    expect(body.nextElementSibling).toBe(footer);
  });

  test('forwards a ref to the outer shell', () => {
    let ref;
    render(<ModalCard ref={(el) => { ref = el; }}>Hello</ModalCard>);
    expect(ref).toBeInstanceOf(HTMLElement);
    expect(ref.className).toContain('rounded-3xl');
  });
});
