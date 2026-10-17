import { forwardRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 4;

// Positions the panel just under its anchor, flipping to the left of the
// anchor's right edge (or above it) when there isn't room -- the same
// collision-avoidance a native <select> or browser autocomplete does, so a
// control near the edge of a scrollable modal never gets clipped.
function computePosition(anchorEl, panelEl) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const panelRect = panelEl.getBoundingClientRect();

  let left = anchorRect.left;
  if (left + panelRect.width > window.innerWidth - GAP) {
    left = anchorRect.right - panelRect.width;
  }
  left = Math.max(GAP, left);

  let top = anchorRect.bottom + GAP;
  if (top + panelRect.height > window.innerHeight - GAP) {
    top = anchorRect.top - panelRect.height - GAP;
  }
  top = Math.max(GAP, top);

  return { top, left };
}

// Renders its children into a portal at document.body, positioned as
// `fixed` relative to the viewport -- this is what makes DateTimePopover
// and DateRangeField immune to being clipped by an ancestor's
// `overflow-y-auto` (e.g. the Edit Load modal), which would otherwise cut
// off a popover anchored near the container's edge. Invisible on the very
// first paint (before its own size is known), then repositioned in the
// same layout pass to avoid a visible jump.
//
// `matchWidth` makes the panel at least as wide as its anchor (dropdown
// lists), and the panel follows its anchor while anything scrolls or the
// window resizes, instead of drifting away from it.
const PopoverPanel = forwardRef(function PopoverPanel(
  { anchorEl, children, className, role, ariaLabel, id, matchWidth = false, onMouseDown },
  forwardedRef
) {
  const [node, setNode] = useState(null);
  const [style, setStyle] = useState({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!anchorEl || !node) return undefined;
    function place() {
      const widthStyle = matchWidth ? { minWidth: anchorEl.getBoundingClientRect().width } : {};
      setStyle({ position: 'fixed', zIndex: 60, ...widthStyle, ...computePosition(anchorEl, node), visibility: 'visible' });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorEl, node, matchWidth]);

  function setRefs(el) {
    setNode(el);
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  return createPortal(
    <div ref={setRefs} id={id} role={role} aria-label={ariaLabel} style={style} className={className} onMouseDown={onMouseDown}>
      {children}
    </div>,
    document.body
  );
});

export default PopoverPanel;
