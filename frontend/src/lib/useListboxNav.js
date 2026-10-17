import { useEffect, useState } from 'react';

// Keyboard behaviour shared by every dropdown in the app (Select, city,
// state and equipment pickers): Up/Down move through the options (and open
// the list if it's closed), Home/End jump, Enter picks, Escape closes, and
// Tab picks the highlighted option and moves on -- so a form can be filled
// without ever reaching for the mouse.
export function useListboxNav({ count, open, setOpen, onPick, initialIndex = -1 }) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Keep the highlight inside the list as it shrinks while you type.
  useEffect(() => {
    if (activeIndex >= count) setActiveIndex(count > 0 ? count - 1 : -1);
  }, [count, activeIndex]);

  function handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex((i) => (i < 0 ? 0 : i));
          return true;
        }
        setActiveIndex((i) => (count === 0 ? -1 : (i + 1) % count));
        return true;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex((i) => (i < 0 ? Math.max(0, count - 1) : i));
          return true;
        }
        setActiveIndex((i) => (count === 0 ? -1 : (i - 1 + count) % count));
        return true;
      case 'Home':
        if (!open) return false;
        event.preventDefault();
        setActiveIndex(count > 0 ? 0 : -1);
        return true;
      case 'End':
        if (!open) return false;
        event.preventDefault();
        setActiveIndex(count - 1);
        return true;
      case 'Enter':
        if (open && activeIndex >= 0 && activeIndex < count) {
          event.preventDefault();
          onPick(activeIndex);
          return true;
        }
        return false;
      case 'Tab':
        if (open && activeIndex >= 0 && activeIndex < count) onPick(activeIndex);
        if (open) setOpen(false);
        return false;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  return { activeIndex, setActiveIndex, handleKeyDown };
}
