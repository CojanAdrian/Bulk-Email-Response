const SECTIONS = [
  { key: 'sameCity', title: 'Same city (round-trip/dedicated)', columns: [{ key: 'order', label: 'Order #' }, { key: 'route', label: 'Route' }] },
  { key: 'blankEquipment', title: 'Excluded — blank equipment', columns: [{ key: 'order', label: 'Order #' }] },
  { key: 'unknownEquipment', title: 'Unknown equipment code', columns: [{ key: 'order', label: 'Order #' }, { key: 'rawCode', label: 'Code' }] },
  {
    key: 'dedupDecisions',
    title: 'Duplicate lanes resolved',
    columns: [
      { key: 'winner', label: 'Kept' }, { key: 'dropped', label: 'Dropped' }, { key: 'route', label: 'Route' },
      { key: 'equipment', label: 'Equipment' }, { key: 'reason', label: 'Reason' },
    ],
  },
  { key: 'rateAnomalies', title: 'Rate anomalies', columns: [{ key: 'order', label: 'Order #' }, { key: 'detail', label: 'Detail' }] },
  {
    key: 'crossPostFlags',
    title: 'Cross-posted equipment added',
    columns: [{ key: 'order', label: 'Order #' }, { key: 'route', label: 'Route' }, { key: 'addedEquipment', label: 'Added equipment' }],
  },
  {
    key: 'cityOverrideFlags',
    title: 'City override needed',
    columns: [{ key: 'order', label: 'Order #' }, { key: 'route', label: 'Route' }, { key: 'note', label: 'Note' }],
  },
  { key: 'ambiguousCrossPost', title: 'Ambiguous cross-post — verify manually', columns: [{ key: 'order', label: 'Order #' }, { key: 'detail', label: 'Detail' }] },
  { key: 'vOrRFlags', title: '"V or R" — verify manually', columns: [{ key: 'order', label: 'Order #' }, { key: 'detail', label: 'Detail' }] },
  { key: 'locationFlags', title: 'Location flags', columns: [{ key: 'order', label: 'Order #' }, { key: 'detail', label: 'Detail' }] },
];

function AnomalyReport({ anomalies }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Anomaly Report</h2>
      <div className="space-y-4">
        {SECTIONS.map((section) => {
          const rows = anomalies[section.key] || [];
          return (
            <div key={section.key} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                {section.title}
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{rows.length}</span>
              </h3>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500">None found.</p>
              ) : (
                <table className="w-full text-left text-sm text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      {section.columns.map((c) => (
                        <th key={c.key} className="py-1 pr-4">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800/60">
                        {section.columns.map((c) => (
                          <td key={c.key} className="py-1 pr-4">
                            {row[c.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnomalyReport;
