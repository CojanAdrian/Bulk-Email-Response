import { fireEvent, screen, within } from '@testing-library/react';

// Picks an option from one of the app's <Select> dropdowns by its
// accessible name, the way a user would: open it, click the option. Uses
// the list the combobox itself controls, so another open picker on the
// page can't be mistaken for it.
export function chooseOption(comboboxName, optionName, container = screen) {
  const trigger = container.getByRole('combobox', { name: comboboxName });
  fireEvent.click(trigger);
  const listbox = document.getElementById(trigger.getAttribute('aria-controls'));
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
}
