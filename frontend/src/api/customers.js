import { get } from './client';

export function listCustomers() {
  return get('/api/customers');
}

export function getCustomerCarriers({ name, range = 'all', equipment = '', loadType = 'all' }) {
  const params = new URLSearchParams({ name });
  if (loadType && loadType !== 'all') params.set('loadType', loadType);
  if (range && range !== 'all') params.set('range', range);
  if (equipment) params.set('equipment', equipment);
  return get(`/api/customers/carriers?${params.toString()}`);
}
