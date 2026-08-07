import { useState } from 'react';
import Papa from 'papaparse';
import { parseMcleodRows, cleanText } from '../lib/mcleodParser';
import { uploadLoads } from '../api/loads';

function UploadPanel({ onUploadComplete }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'parsing' | 'uploading' | 'done'
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = '';
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Upload loads CSV</h2>
      <input
        type="file"
        accept=".csv"
        aria-label="Upload loads CSV"
        onChange={handleFileChange}
        disabled={status === 'parsing' || status === 'uploading'}
        className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-500"
      />
      {status === 'parsing' && <p className="mt-3 text-sm text-slate-400">Parsing file...</p>}
      {status === 'uploading' && <p className="mt-3 text-sm text-slate-400">Uploading...</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {result && (
        <p className="mt-3 text-sm text-emerald-400">
          Uploaded: {result.inserted} new, {result.updated} updated.
        </p>
      )}
    </div>
  );
}

export default UploadPanel;
