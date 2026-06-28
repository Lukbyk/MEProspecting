// =====================================================================
// Preload — jedyny most między GUI (renderer) a bazą (proces główny).
// contextIsolation = ON, więc GUI nie ma dostępu do Node ani dysku;
// dostaje tylko te funkcje, które tu jawnie wystawimy jako window.api.
// =====================================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // diagnostyka
  dbPath: () => ipcRenderer.invoke('app:dbPath'),
  stats:  () => ipcRenderer.invoke('db:stats'),
  processDoc: () => ipcRenderer.invoke('app:processDoc'),

  // odczyt
  people:    () => ipcRenderer.invoke('db:people'),
  companies: () => ipcRenderer.invoke('db:companies'),
  campaigns: () => ipcRenderer.invoke('db:campaigns'),
  events:    () => ipcRenderer.invoke('db:events'),

  // zapis (wzorzec akcji operatora)
  setCampaignAccess: (id, campaignId) =>
    ipcRenderer.invoke('db:setCampaignAccess', { id, campaignId }),
  confirmCampaignPerson: (id) =>
    ipcRenderer.invoke('db:confirmCampaignPerson', { id }),
  rejectCampaignPerson: (id) =>
    ipcRenderer.invoke('db:rejectCampaignPerson', { id }),
});
