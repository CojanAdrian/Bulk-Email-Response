// What the app's own pages (the first-run and offline screens) may ask the
// desktop side to do. BulkPosting itself only reads that it runs here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bulkpostingDesktop', {
  isDesktop: true,
  version: ipcRenderer.sendSync('desktop:version'),
  address: () => ipcRenderer.invoke('desktop:address'),
  setAddress: (address) => ipcRenderer.invoke('desktop:set-address', address),
  retry: () => ipcRenderer.invoke('desktop:retry'),
  changeAddress: () => ipcRenderer.invoke('desktop:change-address'),
});
