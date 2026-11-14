import Papa from 'papaparse';
import { parseMcleodRows, cleanText } from './mcleodParser';
import { uploadLoads } from '../api/loads';

// Turns a McLeod CSV (a File, or the CSV text itself) into loads. Rejects
// with a message meant to be shown to the user as-is.
export function parseLoadsCsv(input) {
  return new Promise((resolve, reject) => {
    Papa.parse(input, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => cleanText(header),
      complete: (results) => {
        try {
          const fields = results.meta.fields || [];
          if (fields.length === 0) {
            reject(new Error('The file appears to be empty or not a valid CSV.'));
            return;
          }
          const { loads, missing } = parseMcleodRows(fields, results.data);
          if (missing.length) {
            reject(new Error(`The file is missing required column(s): ${missing.join(', ')}`));
            return;
          }
          if (loads.length === 0) {
            reject(new Error('The file contains headers but no usable data rows.'));
            return;
          }
          resolve(loads);
        } catch {
          reject(new Error('Failed to process the file. Please check its format and try again.'));
        }
      },
      error: (err) => reject(new Error(`Failed to read file: ${err.message}`)),
    });
  });
}

// Parses and uploads in one go. onStage is told 'parsing' then 'uploading'.
// Resolves with the server's { inserted, updated } counts.
export async function importLoads(input, { onStage } = {}) {
  onStage?.('parsing');
  const loads = await parseLoadsCsv(input);
  onStage?.('uploading');
  try {
    return await uploadLoads(loads);
  } catch (err) {
    throw new Error(`Upload failed — no loads were saved. ${err.message || 'Upload failed.'}`);
  }
}

// Pasted text counts as a CSV when it has a header line and at least one
// row, separated by commas or tabs.
export function looksLikeCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  return lines.length >= 2 && /[,\t]/.test(lines[0]);
}
