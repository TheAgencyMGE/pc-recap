import { contextBridge, ipcRenderer } from 'electron';
import type { PCRecapAPI } from '../shared/ipc.js';
import type { TrackingStatus } from '../shared/types.js';

const api: PCRecapAPI = {
  getDashboard: (kind, year) => ipcRenderer.invoke('dashboard:get', kind, year),
  getSummary: (kind, year) => ipcRenderer.invoke('summary:get', kind, year),
  getTimeline: (level, anchor) => ipcRenderer.invoke('timeline:get', level, anchor),
  getAppDetail: (appId) => ipcRenderer.invoke('app:detail', appId),
  getAppIcon: (appId) => ipcRenderer.invoke('app:icon', appId),
  listApps: () => ipcRenderer.invoke('apps:list'),
  getAchievements: () => ipcRenderer.invoke('achievements:get'),
  getOnThisDay: () => ipcRenderer.invoke('on-this-day:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getCategories: () => ipcRenderer.invoke('categories:get'),
  saveCategory: (category) => ipcRenderer.invoke('category:save', category),
  updateCategory: (category) => ipcRenderer.invoke('category:update', category),
  deleteCategory: (categoryId, reassignToCategoryId) => ipcRenderer.invoke('category:delete', categoryId, reassignToCategoryId),
  setAppCategory: (appId, categoryId) => ipcRenderer.invoke('app:set-category', appId, categoryId),
  setAppExcluded: (appId, excluded) => ipcRenderer.invoke('app:set-excluded', appId, excluded),
  getTrackingStatus: () => ipcRenderer.invoke('tracking:status'),
  setTrackingEnabled: (enabled) => ipcRenderer.invoke('tracking:set', enabled),
  onTrackingStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: TrackingStatus) => callback(status);
    ipcRenderer.on('tracking:changed', listener);
    return () => ipcRenderer.removeListener('tracking:changed', listener);
  },
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  saveShareCard: (dataUrl, suggestedName) => ipcRenderer.invoke('share:save', dataUrl, suggestedName),
  deleteAllHistory: () => ipcRenderer.invoke('history:delete-all'),
  getVersion: () => ipcRenderer.invoke('app:version'),
};

contextBridge.exposeInMainWorld('pcRecap', api);
