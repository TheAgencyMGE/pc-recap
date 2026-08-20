// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseEpicManifest, parseSteamEvidence } from './game-launchers';

describe('game launcher recovery', () => {
  it('keeps Steam last-played and known playtime as provenance-rich evidence', () => {
    const event = parseSteamEvidence(`
      "AppState" { "appid" "413150" "name" "Stardew Valley" "LastUpdated" "1710000000" }
    `, `"apps" { "413150" { "Playtime" "2220" "LastPlayed" "1722506400" } }`);

    expect(event).toMatchObject({
      appName: 'Stardew Valley', occurredAt: '2024-08-01T10:00:00.000Z', sourceKind: 'steam_local_metadata',
      provenance: 'recovered', evidenceType: 'launcher-last-played', datePrecision: 'exact',
      durationKnown: true, playtimeSeconds: 133_200, represents: 'execution', confidence: 'high',
    });
  });

  it('labels a Steam manifest timestamp as approximate presence when playtime is unknown', () => {
    const event = parseSteamEvidence(`"AppState" { "appid" "620" "name" "Portal 2" "LastUpdated" "1710000000" }`);

    expect(event).toMatchObject({
      appName: 'Portal 2', occurredAt: '2024-03-09T16:00:00.000Z', datePrecision: 'approximate',
      durationKnown: false, represents: 'presence', confidence: 'low',
    });
    expect(event).not.toHaveProperty('playtimeSeconds');
  });

  it('reads a real Epic installation timestamp without inventing playtime', () => {
    const event = parseEpicManifest(JSON.stringify({
      AppName: 'Fortnite', DisplayName: 'Fortnite', InstallDate: '2026-07-03T18:22:11.000Z',
      InstallLocation: 'C:\\Program Files\\Epic Games\\Fortnite',
    }));

    expect(event).toMatchObject({
      appName: 'Fortnite', eventType: 'installed', sourceKind: 'epic_local_manifest',
      occurredAt: '2026-07-03T18:22:11.000Z', evidenceType: 'launcher-install-manifest',
      datePrecision: 'exact', durationKnown: false, represents: 'installation', confidence: 'medium',
    });
    expect(event).not.toHaveProperty('playtimeSeconds');
  });

  it('ignores missing and malformed launcher evidence', () => {
    expect(parseSteamEvidence('not a vdf')).toBeUndefined();
    expect(parseEpicManifest('{ definitely not json')).toBeUndefined();
    expect(parseEpicManifest(JSON.stringify({ DisplayName: 'Mystery Game' }))).toBeUndefined();
  });
});
