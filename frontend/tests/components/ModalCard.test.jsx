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

  test('the inner body -- not the outer shell -- owns the scroll and max-height', () => {
    render(<ModalCard maxHeight="50vh">Hello</ModalCard>);
    const inner = screen.getByText('Hello');
    expect(inner.className).toContain('overflow-y-auto');
    expect(inner).toHaveStyle({ maxHeight: '50vh' });
  });

  test('forwards a ref to the outer shell', () => {
    let ref;
    render(<ModalCard ref={(el) => { ref = el; }}>Hello</ModalCard>);
    expect(ref).toBeInstanceOf(HTMLElement);
    expect(ref.className).toContain('rounded-3xl');
  });
});
