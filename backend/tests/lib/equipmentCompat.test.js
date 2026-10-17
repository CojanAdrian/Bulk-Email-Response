const { expandEquipment, isEquipmentCompatible } = require('../../src/lib/equipmentCompat');

describe('expandEquipment', () => {
  test('VR and RV expand to van and reefer', () => {
    expect([...expandEquipment('VR')].sort()).toEqual(['R', 'V']);
    expect([...expandEquipment('rv')].sort()).toEqual(['R', 'V']);
  });
  test('other codes expand to themselves, uppercased and trimmed', () => {
    expect([...expandEquipment(' f ')]).toEqual(['F']);
  });
  test('empty/null expands to an empty set', () => {
    expect(expandEquipment(null).size).toBe(0);
    expect(expandEquipment('').size).toBe(0);
  });
});

describe('isEquipmentCompatible', () => {
  test('VR is compatible with V and with R, both directions', () => {
    expect(isEquipmentCompatible('VR', ['V'])).toBe(true);
    expect(isEquipmentCompatible('V', ['VR'])).toBe(true);
    expect(isEquipmentCompatible('R', ['RV'])).toBe(true);
  });
  test('V is not compatible with F', () => {
    expect(isEquipmentCompatible('V', ['F'])).toBe(false);
  });
  test('any overlap in a list counts', () => {
    expect(isEquipmentCompatible('R', ['F', 'R'])).toBe(true);
  });
  test('unknown on either side is compatible', () => {
    expect(isEquipmentCompatible(null, ['F'])).toBe(true);
    expect(isEquipmentCompatible('V', [])).toBe(true);
    expect(isEquipmentCompatible('V', null)).toBe(true);
  });
});
