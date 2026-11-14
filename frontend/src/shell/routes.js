export const NAV = [
  { key: 'loads', label: 'Loads', path: '/loads' },
  { key: 'inquiries', label: 'Inquiries', path: '/inquiries' },
  { key: 'carriers', label: 'Carriers', path: '/carriers' },
  { key: 'customers', label: 'Customers', path: '/customers' },
  { key: 'stats', label: 'Stats', path: '/stats' },
];

// "/carriers/42" -> "carriers". Anything unknown is the Loads board.
export function tabFromPath(pathname) {
  const first = String(pathname || '').split('/').filter(Boolean)[0];
  return NAV.some((item) => item.key === first) ? first : 'loads';
}
