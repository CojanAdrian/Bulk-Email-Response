import { fireEvent, screen, within } from '@testing-library/react';

// Picks an option from one of the app's <Select> dropdowns by its
// accessible name, the way a user would: open it, click the option.
export function chooseOption(comboboxName, optionName, container = screen) {
  fireEvent.click(container.getByRole('combobox', { name: comboboxName }));
  const listbox = screen.getByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
}
