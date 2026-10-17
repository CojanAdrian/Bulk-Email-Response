import { createPortal } from 'react-dom';

// Renders overlays (modals, sheets) straight into <body>. Needed because
// the glass cards use backdrop-filter, and any ancestor with a filter
// becomes the containing block for position:fixed descendants -- a modal
// rendered inside a card would be trapped inside (and clipped by) that
// card instead of covering the screen.
function Portal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

export default Portal;
