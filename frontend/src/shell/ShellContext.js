import { createContext, useContext } from 'react';

// What the shell offers the screen inside it:
//   notify({ tone, title, detail })  show a short message in the island
//   importFile(file)                 import a McLeod CSV, same as dropping it
const ShellContext = createContext({ notify: () => {}, importFile: () => {} });

export function useShell() {
  return useContext(ShellContext);
}

export default ShellContext;
