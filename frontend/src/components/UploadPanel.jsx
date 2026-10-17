import { useState } from 'react';
import Papa from 'papaparse';
import { parseMcleodRows, cleanText } from '../lib/mcleodParser';
import { uploadLoads } from '../api/loads';
import Card from './Card';
import { UploadIcon } from './icons';

function UploadPanel({ onUploadComplete, headerActions }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'parsing' | 'uploading' | 'done'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [dragging, setDragging] = useState(false);
  const busy = status === 'parsing' || status === 'uploading';

  function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
    handleFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    handleFile(e.dataTransfer?.files?.[0]);
  }

  function handleFile(file) {
    if (!file) return;

    setError(null);
    setResult(null);
    setStatus('parsing');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => cleanText(h),
      complete: (results) => {
        try {
          const fields = results.meta.fields || [];
          if (fields.length === 0) {
            setError('The file appears to be empty or not a valid CSV.');
            setStatus('idle');
            return;
          }
          const { loads, missing } = parseMcleodRows(fields, results.data);
          if (missing.length) {
            setError(`The file is missing required column(s): ${missing.join(', ')}`);
            setStatus('idle');
            return;
          }
          if (loads.length === 0) {
            setError('The file contains headers but no usable data rows.');
            setStatus('idle');
            return;
          }
          submitLoads(loads);
        } catch (err) {
          setError('Failed to process the file. Please check its format and try again.');
          setStatus('idle');
        }
      },
      error: (err) => {
        setError(`Failed to read file: ${err.message}`);
        setStatus('idle');
      },
    });
  }

  function submitLoads(loads) {
    setStatus('uploading');
    uploadLoads(loads)
      .then((data) => {
        setResult(data);
        setStatus('done');
        onUploadComplete();
      })
      .catch((err) => {
        const detail = err.message || 'Upload failed.';
        setError(`Upload failed — no loads were saved. ${detail}`);
        setStatus('idle');
      });
  }

  return (
    <Card
      className={`p-3 transition-colors duration-200 sm:p-3 ${dragging ? 'ring-2 ring-focus' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label
          className={`group flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-3 py-2.5 transition-colors duration-200 ${
            dragging ? 'border-focus bg-accent/10' : 'border-border hover:border-text-muted/50 hover:bg-surface-alt'
          } ${busy ? 'cursor-wait opacity-70' : ''}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink">
            <UploadIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">Upload loads CSV</span>
            <span className="block truncate text-xs text-text-muted">
              {status === 'parsing' ? 'Parsing file…' : status === 'uploading' ? 'Uploading…' : 'Drop a McLeod export here, or click to browse'}
            </span>
          </span>
          <input
            type="file"
            accept=".csv"
            aria-label="Upload loads CSV"
            onChange={handleFileChange}
            disabled={busy}
            className="sr-only"
          />
        </label>
        {headerActions && <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>}
      </div>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-error">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="mt-2 px-1 text-sm text-success">
          Uploaded: {result.inserted} new, {result.updated} updated.
        </p>
      )}
    </Card>
  );
}

export default UploadPanel;
