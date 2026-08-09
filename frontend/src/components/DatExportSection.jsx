import { useEffect, useState } from 'react';
import { listLoads } from '../api/loads';
import { processLoadsForExport, buildDatCsv, buildDatExportFilename, countAnomalies } from '../lib/datExport';
import ContactMethodModal from './ContactMethodModal';
import RateSelectionModal from './RateSelectionModal';
import AnomalyReport from './AnomalyReport';
import LoadLookupPanel from './LoadLookupPanel';
import BlastModal from './BlastModal';
import Card from './Card';
import PrimaryButton from './PrimaryButton';

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
  const [step, setStep] = useState('idle'); // 'idle' | 'contactMethod' | 'rateSelection'
  const [contactOptions, setContactOptions] = useState(null);
  const [result, setResult] = useState(null);
  const [blastTarget, setBlastTarget] = useState(null);

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
  }, [refreshKey]);

  function runExport(options, rateOverrides) {
    const { exportRows, anomalies } = processLoadsForExport(loads, { ...options, rateOverrides: rateOverrides || {} });
    const csv = buildDatCsv(exportRows);
    downloadCsv(csv, buildDatExportFilename());
    setResult({ anomalies, exportedCount: exportRows.length });
    setStep('idle');
    setContactOptions(null);
  }

  function handleContactConfirm(options) {
    if (options.rateChoice === 'some') {
      setContactOptions(options);
      setStep('rateSelection');
    } else {
      runExport(options);
    }
  }

  function handleRateConfirm(rateOverrides) {
    runExport(contactOptions, rateOverrides);
  }

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">DAT Export</h2>
          {fetchStatus === 'loading' && <p className="text-sm text-text-muted">Loading active loads...</p>}
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

      {fetchStatus === 'ready' && loads.length > 0 && (
        <LoadLookupPanel loads={loads} onOpenBlast={(load, showRate) => setBlastTarget({ load, showRate })} />
      )}

      {step === 'contactMethod' && <ContactMethodModal onCancel={() => setStep('idle')} onConfirm={handleContactConfirm} />}
      {step === 'rateSelection' && (
        <RateSelectionModal loads={loads} onCancel={() => setStep('idle')} onConfirm={handleRateConfirm} />
      )}
      {blastTarget && (
        <BlastModal load={blastTarget.load} initialShowRate={blastTarget.showRate} onClose={() => setBlastTarget(null)} />
      )}
    </div>
  );
}

export default DatExportSection;
