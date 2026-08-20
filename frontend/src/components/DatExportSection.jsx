import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { listLoads } from '../api/loads';
import { subscribe } from '../lib/liveSocket';
import { processLoadsForExport, buildDatCsv, buildDatExportFilename, countAnomalies } from '../lib/datExport';
import ContactMethodModal from './ContactMethodModal';
import AnomalyReport from './AnomalyReport';
import Card from './Card';
import PrimaryButton from './PrimaryButton';
import Skeleton from './Skeleton';

function downloadCsv(csv, filename) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DatExportSection({ refreshKey }) {
  const [loads, setLoads] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [fetchError, setFetchError] = useState(null);
  const [step, setStep] = useState('idle'); // 'idle' | 'contactMethod'
  const [result, setResult] = useState(null);
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    let ignore = false;
    setFetchStatus('loading');
    setFetchError(null);
    listLoads('active')
      .then((data) => {
        if (!ignore) {
          setLoads(data);
          setFetchStatus('ready');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFetchError(err.message || 'Failed to load active loads.');
          setFetchStatus('error');
        }
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey, liveTick]);

  useEffect(() => {
    return subscribe('load:changed', () => setLiveTick((t) => t + 1));
  }, []);

  function handleContactConfirm(options) {
    const { exportRows, anomalies } = processLoadsForExport(loads, options);
    const csv = buildDatCsv(exportRows);
    downloadCsv(csv, buildDatExportFilename());
    setResult({ anomalies, exportedCount: exportRows.length });
    setStep('idle');
  }

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">DAT Export</h2>
          {fetchStatus === 'loading' && <Skeleton height="1rem" width="12rem" />}
          {fetchStatus === 'error' && (
            <p role="alert" className="text-sm text-error">
              {fetchError}
            </p>
          )}
          {fetchStatus === 'ready' && <p className="text-sm text-text-muted">{loads.length} active load(s) ready to export.</p>}
        </div>
        <PrimaryButton onClick={() => setStep('contactMethod')} disabled={fetchStatus !== 'ready' || loads.length === 0}>
          Generate DAT Export
        </PrimaryButton>
      </Card>

      {result && (
        <>
          <p className="text-sm text-text-muted">
            Downloaded a DAT CSV with {result.exportedCount} row(s). {countAnomalies(result.anomalies)} anomaly flag(s) below.
          </p>
          <AnomalyReport anomalies={result.anomalies} />
        </>
      )}

      <AnimatePresence>
        {step === 'contactMethod' && <ContactMethodModal onCancel={() => setStep('idle')} onConfirm={handleContactConfirm} />}
      </AnimatePresence>
    </div>
  );
}

export default DatExportSection;
