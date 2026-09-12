import { useCallback, useState } from 'react';

// Selection-mode state for a list: hidden by default (no leading circles,
// no bulk bar) until the user explicitly enters it via a "Select" button --
// mirrors the iOS Mail/Photos pattern, where selection UI only appears on
// request rather than always-on checkboxes.
export function useSelectionMode() {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const enter = useCallback(() => {
    setActive(true);
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set());
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Selects every id in `ids`, unless all of them are already selected --
  // in which case it clears the selection instead (a "Select All" toggle).
  const selectAll = useCallback((ids) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const remove = useCallback((id) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  return { active, selectedIds, enter, exit, clear, toggle, selectAll, remove, isSelected };
}
