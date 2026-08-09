import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PCRecapAPI } from '../../shared/ipc';

const AppIconContext = createContext<PCRecapAPI | null>(null);
const iconCaches = new WeakMap<PCRecapAPI, Map<string, Promise<string | null>>>();

export function AppIconProvider({ api, children }: { api: PCRecapAPI; children: React.ReactNode }) {
  return <AppIconContext.Provider value={api}>{children}</AppIconContext.Provider>;
}

function requestIcon(api: PCRecapAPI, appId: string) {
  let cache = iconCaches.get(api);
  if (!cache) {
    cache = new Map();
    iconCaches.set(api, cache);
  }
  const existing = cache.get(appId);
  if (existing) return existing;
  const request = api.getAppIcon(appId).catch(() => null);
  cache.set(appId, request);
  return request;
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function AppIcon({
  appId,
  name,
  color,
  size = 'medium',
}: {
  appId: string;
  name: string;
  color: string;
  size?: 'small' | 'medium' | 'large';
}) {
  const api = useContext(AppIconContext);
  const [source, setSource] = useState<string | null>();
  const initials = useMemo(() => initialsFor(name), [name]);

  useEffect(() => {
    let live = true;
    setSource(undefined);
    if (!api) {
      setSource(null);
      return () => { live = false; };
    }
    void requestIcon(api, appId).then((result) => { if (live) setSource(result); });
    return () => { live = false; };
  }, [api, appId]);

  if (source) {
    return <span className={`app-icon app-icon--${size}`} style={{ '--app-color': color } as React.CSSProperties}>
      <img src={source} alt={`${name} icon`} />
    </span>;
  }

  return <span className={`app-icon app-icon--${size} app-icon--fallback`} style={{ '--app-color': color } as React.CSSProperties} aria-label={`${name} icon`}>
    {initials}
  </span>;
}
