import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AnomalyReport from '../../src/components/AnomalyReport';

const EMPTY_ANOMALIES = {
  sameCity: [], blankEquipment: [], unknownEquipment: [], dedupDecisions: [],
  rateAnomalies: [], crossPostFlags: [], cityOverrideFlags: [], ambiguousCrossPost: [],
  vOrRFlags: [], locationFlags: [],
};

describe('AnomalyReport', () => {
  test('shows "None found" for every category when there are no anomalies', () => {
    render(<AnomalyReport anomalies={EMPTY_ANOMALIES} />);
    expect(screen.getAllByText(/none found/i)).toHaveLength(10);
  });

  test('renders a table row for each anomaly with the section\'s count badge', () => {
    const anomalies = { ...EMPTY_ANOMALIES, rateAnomalies: [{ order: '1001', detail: 'Rate $0 (zero-rate load).' }] };
    render(<AnomalyReport anomalies={anomalies} />);
    const section = screen.getByText(/rate anomalies/i).closest('div');
    expect(within(section).getByText('1')).toBeInTheDocument();
    expect(within(section).getByText('1001')).toBeInTheDocument();
    expect(within(section).getByText('Rate $0 (zero-rate load).')).toBeInTheDocument();
  });

  test('renders dedup decisions with all five of their columns', () => {
    const anomalies = {
      ...EMPTY_ANOMALIES,
      dedupDecisions: [{ winner: 'HEAVY', dropped: 'LIGHT', route: 'Chicago -> Dallas', equipment: 'V', reason: 'Higher weight' }],
    };
    render(<AnomalyReport anomalies={anomalies} />);
    expect(screen.getByText('HEAVY')).toBeInTheDocument();
    expect(screen.getByText('LIGHT')).toBeInTheDocument();
    expect(screen.getByText('Higher weight')).toBeInTheDocument();
  });
});
