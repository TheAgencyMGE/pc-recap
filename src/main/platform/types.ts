import type { ActivitySource } from '../activity-source.js';

export type WindowTitleCapability = 'available' | 'permission-required' | 'unavailable';

export interface PlatformActivityCapabilities {
  platform: NodeJS.Platform;
  collector: string;
  available: boolean;
  sessionType?: 'windows' | 'aqua' | 'x11' | 'wayland' | 'unknown';
  windowTitles: WindowTitleCapability;
}

export interface ActivitySourceSelection {
  id: string;
  available: boolean;
  source: ActivitySource;
  capabilities: PlatformActivityCapabilities;
  reason?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (file: string, args: string[]) => Promise<CommandResult>;
