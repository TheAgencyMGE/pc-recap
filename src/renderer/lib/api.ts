import type { PCWrappedAPI } from '../../shared/ipc';

const unavailable = () => Promise.reject(new Error(
  'PC Wrapped must be opened through the Electron desktop app. The browser renderer has no activity-data access.',
));

const unavailableApi = new Proxy({}, {
  get: (_target, property) => property === 'onTrackingStatus' ? () => () => undefined : unavailable,
}) as PCWrappedAPI;

export const rendererApi: PCWrappedAPI = window.pcWrapped ?? unavailableApi;
