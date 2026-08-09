export const PRODUCT_NAME = 'PC Recap';
export const PRODUCT_SLUG = 'pc-recap';
export const APP_ID = 'com.pcrecap.app';
export const DATABASE_FILE = 'pc-recap.db';
export const BACKUP_EXTENSION = 'pcr';
export const LEGACY_BACKUP_EXTENSIONS = ['pcw'] as const;

export const LEGACY_PRODUCT_NAMES = ['PC Wrapped'] as const;
export const LEGACY_DATABASE_LOCATIONS = [
  { directory: 'PC Wrapped', file: 'pc-wrapped.db' },
  { directory: 'pc-wrapped', file: 'pc-wrapped.db' },
] as const;

export function isSupportedBackupProduct(value: unknown): value is string {
  return value === PRODUCT_NAME || LEGACY_PRODUCT_NAMES.some((name) => name === value);
}
