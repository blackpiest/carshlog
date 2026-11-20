import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CarsharingProvider, type ExternalSourceId } from './db';
import { plateToLatin } from './plate';

export interface ExternalSource {
  id: ExternalSourceId;
  label: string;
  /**
   * URL to open. `{plate}` → the plate as stored (uppercase Cyrillic, URL-encoded);
   * `{plate_lat}` → lowercase Latin look-alikes («a777aa797»).
   */
  urlTemplate: string;
}

/**
 * Both services accept the plate in the path and open the check straight away:
 * Автокод — Cyrillic, URL-encoded (`/proverkaavto/Н007МА797`); Номерограм — lowercase Latin
 * (`/n/a777aa797`). The plate is still copied to the clipboard (PRD §12.4). Editable in settings.
 */
export const DEFAULT_SOURCES: ExternalSource[] = [
  { id: 'avtocod', label: 'Автокод', urlTemplate: 'https://avtocod.ru/proverkaavto/{plate}' },
  { id: 'nomerogram', label: 'Номерограм', urlTemplate: 'https://www.nomerogram.ru/n/{plate_lat}' },
];

/** Earlier built-in defaults: a stored source still on one of these follows the current default. */
const OUTDATED_DEFAULTS: Partial<Record<ExternalSourceId, string[]>> = {
  avtocod: ['https://avtocod.ru/'],
  nomerogram: ['https://www.nomerogram.ru/'],
};

function upgradeSources(stored: ExternalSource[]): ExternalSource[] {
  return stored.map((s) => {
    if (!OUTDATED_DEFAULTS[s.id]?.includes(s.urlTemplate)) return s;
    const def = DEFAULT_SOURCES.find((d) => d.id === s.id);
    return def ? { ...s, urlTemplate: def.urlTemplate } : s;
  });
}

export interface Settings {
  lastProvider: CarsharingProvider;
  sources: ExternalSource[];
  lastBackupAt: number | null;
}

const DEFAULTS: Settings = { lastProvider: 'citydrive', sources: DEFAULT_SOURCES, lastBackupAt: null };

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key);
  const value = (row?.value as Settings[K]) ?? DEFAULTS[key];
  if (key === 'sources') return upgradeSources(value as ExternalSource[]) as Settings[K];
  return value;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value });
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useLiveQuery(() => getSetting(key), [key]) ?? DEFAULTS[key];
}

export function buildSourceUrl(src: ExternalSource, plate: string): string {
  return src.urlTemplate
    .replace(/\{plate_lat\}/g, encodeURIComponent(plateToLatin(plate)))
    .replace(/\{plate\}/g, encodeURIComponent(plate));
}
