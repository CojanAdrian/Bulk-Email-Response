// The searchable list a person picks from when manually typing an equipment
// type (Add Load / Edit Load), instead of free-typing a code that might not
// match what the rest of the app (matching, DAT export) actually recognizes.
// Codes match EQUIPMENT_MAP's normalized output values in mcleodParser.js --
// the same vocabulary a CSV upload already normalizes raw codes into.
export const EQUIPMENT_OPTIONS = [
  { code: 'V', label: 'Van' },
  { code: 'R', label: 'Reefer' },
  { code: 'F', label: 'Flatbed' },
  { code: 'FT', label: 'Flatbed w/ Tarps' },
  { code: 'SD', label: 'Step Deck' },
  { code: 'SP', label: 'Sprinter Van' },
  { code: 'SB', label: 'Straight/Box Truck' },
  { code: 'RGN', label: 'Removable Gooseneck' },
  { code: 'CN', label: 'Conestoga' },
  { code: 'PO', label: 'Power Only' },
  { code: 'RV', label: 'Reefer or Van' },
  { code: 'VR', label: 'Van or Reefer' },
  { code: 'BR', label: 'BR' },
  { code: 'RZ', label: 'RZ' },
  { code: 'RM', label: 'RM' },
  { code: 'VM', label: 'VM' },
  { code: 'RR', label: 'RR' },
  { code: 'VZ', label: 'VZ' },
];
