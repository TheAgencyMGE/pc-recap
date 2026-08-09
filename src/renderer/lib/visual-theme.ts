import type { PeriodKind, TimeBucket } from '../../shared/types';

export interface MixtapeTheme {
  background: string;
  foreground: string;
  accent: string;
  support: string;
}

export interface TapeBand {
  label: string;
  seconds: number;
  share: number;
  color: string;
}

export const MIXTAPE_COLORS = {
  paper: '#F6F6F1',
  cleanPaper: '#FFFFFF',
  ink: '#151515',
  softInk: '#353535',
  red: '#FF6038',
  lilac: '#AA9DFF',
  acid: '#C9F227',
  yellow: '#FFD43B',
  cobalt: '#4256F4',
  pink: '#FF9FC9',
} as const;

const PERIOD_PALETTES: Record<PeriodKind, MixtapeTheme[]> = {
  today: [
    { background: MIXTAPE_COLORS.yellow, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.lilac, support: MIXTAPE_COLORS.cleanPaper },
    { background: MIXTAPE_COLORS.acid, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.cobalt, support: MIXTAPE_COLORS.cleanPaper },
  ],
  week: [
    { background: MIXTAPE_COLORS.lilac, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.red, support: MIXTAPE_COLORS.cleanPaper },
    { background: MIXTAPE_COLORS.cobalt, foreground: MIXTAPE_COLORS.cleanPaper, accent: MIXTAPE_COLORS.acid, support: MIXTAPE_COLORS.paper },
  ],
  month: [
    { background: MIXTAPE_COLORS.red, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.acid, support: MIXTAPE_COLORS.cleanPaper },
    { background: MIXTAPE_COLORS.pink, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.cobalt, support: MIXTAPE_COLORS.cleanPaper },
  ],
  year: [
    { background: MIXTAPE_COLORS.ink, foreground: MIXTAPE_COLORS.cleanPaper, accent: MIXTAPE_COLORS.yellow, support: MIXTAPE_COLORS.lilac },
    { background: MIXTAPE_COLORS.cleanPaper, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.red, support: MIXTAPE_COLORS.acid },
  ],
  'all-time': [
    { background: MIXTAPE_COLORS.paper, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.cobalt, support: MIXTAPE_COLORS.yellow },
    { background: MIXTAPE_COLORS.acid, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.red, support: MIXTAPE_COLORS.cleanPaper },
  ],
  decade: [
    { background: MIXTAPE_COLORS.yellow, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.red, support: MIXTAPE_COLORS.lilac },
    { background: MIXTAPE_COLORS.ink, foreground: MIXTAPE_COLORS.cleanPaper, accent: MIXTAPE_COLORS.pink, support: MIXTAPE_COLORS.acid },
  ],
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function themeForPeriod(kind: PeriodKind, label: string): MixtapeTheme {
  const palettes = PERIOD_PALETTES[kind];
  return palettes[stableHash(`${kind}:${label}`) % palettes.length];
}

export function themeForApp(appId: string, preferredColor?: string): MixtapeTheme {
  const accents = [MIXTAPE_COLORS.red, MIXTAPE_COLORS.lilac, MIXTAPE_COLORS.acid, MIXTAPE_COLORS.yellow, MIXTAPE_COLORS.cobalt, MIXTAPE_COLORS.pink];
  const accent = /^#[0-9a-f]{6}$/i.test(preferredColor ?? '') ? preferredColor!.toUpperCase() : accents[stableHash(appId) % accents.length];
  return { background: accent, foreground: MIXTAPE_COLORS.ink, accent: MIXTAPE_COLORS.cleanPaper, support: MIXTAPE_COLORS.paper };
}

export function buildTapeBands(buckets: TimeBucket[], colors: string[]): TapeBand[] {
  const active = buckets.filter((bucket) => Number.isFinite(bucket.seconds) && bucket.seconds > 0);
  const total = active.reduce((sum, bucket) => sum + bucket.seconds, 0);
  if (total <= 0) return [];
  const palette = colors.length > 0 ? colors : [MIXTAPE_COLORS.ink];
  return active.map((bucket, index) => ({
    label: bucket.label,
    seconds: bucket.seconds,
    share: Math.round((bucket.seconds / total) * 10_000) / 100,
    color: palette[index % palette.length],
  }));
}
