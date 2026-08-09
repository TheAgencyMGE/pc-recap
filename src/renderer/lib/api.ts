import type { PCRecapAPI } from '../../shared/ipc';

const unavailable = () => Promise.reject(new Error(
  'PC Recap must be opened through the Electron desktop app. The browser renderer has no activity-data access.',
));

const unavailableApi = new Proxy({}, {
  get: (_target, property) => property === 'onTrackingStatus' ? () => () => undefined : unavailable,
}) as PCRecapAPI;

export const rendererApi: PCRecapAPI = window.pcRecap ?? unavailableApi;
