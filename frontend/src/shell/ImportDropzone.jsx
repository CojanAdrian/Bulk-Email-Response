import { useEffect, useRef, useState } from 'react';
import { importLoads, looksLikeCsv } from '../lib/importLoads';

function isTypingTarget(element) {
  if (!element || !element.tagName) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

function carriesFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

// Lets a McLeod CSV be imported from anywhere in the app: drag a file over
// the window and drop it, or paste a copied file or copied CSV text.
// A drop or paste that something else already handled is left alone.
function ImportDropzone({ onImported, onError }) {
  const [dragging, setDragging] = useState(false);
  // Read through a ref so the window listeners attach once and a re-render
  // in the middle of a drag never resets the drag state.
  const callbacks = useRef({ onImported, onError });
  callbacks.current = { onImported, onError };

  useEffect(() => {
    let depth = 0;

    function run(input, name) {
      importLoads(input)
        .then((result) => callbacks.current.onImported?.(result, name))
        .catch((err) => callbacks.current.onError?.(err.message));
    }

    function onDragEnter(event) {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragging(true);
    }

    function onDragLeave(event) {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }

    function onDragOver(event) {
      if (carriesFiles(event)) event.preventDefault();
    }

    function onDrop(event) {
      depth = 0;
      setDragging(false);
      if (event.defaultPrevented) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      event.preventDefault();
      run(file, file.name);
    }

    function onPaste(event) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const file = event.clipboardData?.files?.[0];
      if (file) {
        event.preventDefault();
        run(file, file.name);
        return;
      }
      const text = event.clipboardData?.getData('text/plain');
      if (looksLikeCsv(text)) {
        event.preventDefault();
        run(text, 'Pasted loads');
      }
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return (
    <div
      aria-hidden={!dragging}
      className={`pointer-events-none fixed inset-0 z-[70] grid place-content-center bg-black/55 text-center backdrop-blur-lg transition-opacity duration-300 ${
        dragging ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`mx-auto mb-6 h-[190px] w-[190px] rounded-full border-[1.5px] border-dashed border-white/50 transition-[scale] duration-700 ease-spring motion-safe:animate-[spin_14s_linear_infinite] ${
          dragging ? 'scale-100' : 'scale-75'
        }`}
      />
      <p className="text-[34px] font-bold tracking-[-0.045em] text-text">Drop to build your board</p>
      <p className="mt-2 text-sm text-text-muted">McLeod CSV export. New loads are added, existing ones updated.</p>
    </div>
  );
}

export default ImportDropzone;
