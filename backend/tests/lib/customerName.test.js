const { cleanCustomerName } = require('../../src/lib/customerName');

describe('cleanCustomerName', () => {
  test('drops the McLeod customer code before " - "', () => {
    expect(cleanCustomerName('ALDIDOIL - ALDI, Inc')).toBe('ALDI, Inc');
    expect(cleanCustomerName('SAXCFACA - Saxco International LLC')).toBe('Saxco International LLC');
    expect(cleanCustomerName('ACCECYCA - Accent Building Products')).toBe('Accent Building Products');
  });
  test('keeps names that only contain a dash in the middle', () => {
    expect(cleanCustomerName('Smith-Jones Logistics')).toBe('Smith-Jones Logistics');
    expect(cleanCustomerName('Acme Co - West')).toBe('Acme Co - West');
  });
  test('trims, collapses spaces, and turns blank into null', () => {
    expect(cleanCustomerName('  Kroger   Co ')).toBe('Kroger Co');
    expect(cleanCustomerName('   ')).toBeNull();
    expect(cleanCustomerName(null)).toBeNull();
  });
});
