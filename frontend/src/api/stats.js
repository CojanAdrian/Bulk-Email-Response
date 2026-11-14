import { get } from './client';

// Loads booked today, average gross profit per day for the last week, and
// today's reply times.
export function getToday() {
  return get('/api/stats/today');
}
