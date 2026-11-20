/**
 * Russian civilian licence plate: L DDD LL RR(R), e.g. «А 123 ВС 77» / «Е 001 КХ 799».
 * Only 12 Cyrillic letters are allowed — those that have Latin look-alikes.
 */

export const PLATE_LETTERS = ['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х'] as const;

const LATIN_TO_CYR: Record<string, string> = {
  A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х',
};

const CYR_TO_LATIN: Record<string, string> = Object.fromEntries(
  Object.entries(LATIN_TO_CYR).map(([lat, cyr]) => [cyr, lat]),
);

const LETTER_SET = new Set<string>(PLATE_LETTERS);

/** «А777АА797» → «a777aa797»: Latin look-alikes, lowercase — the form some sites use in URLs. */
export function plateToLatin(normalized: string): string {
  let out = '';
  for (const ch of normalized) out += CYR_TO_LATIN[ch] ?? ch;
  return out.toLowerCase();
}

/** Slot kinds of the full plate mask; the 9th slot (3-digit region) is optional. */
export const PLATE_MASK = ['L', 'D', 'D', 'D', 'L', 'L', 'D', 'D', 'D'] as const;
export const PLATE_MIN_LEN = 8;
export const PLATE_MAX_LEN = 9;
/** Letters + 3 digits — enough to recognise a car regardless of region. */
export const PLATE_BASE_LEN = 6;

const FULL_RE = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/;

/**
 * Uppercases, maps Latin look-alikes to Cyrillic, drops spaces, dashes and any
 * other symbols. Does not validate — see {@link isValidPlate}.
 */
export function normalizePlate(input: string): string {
  let out = '';
  for (const raw of input.toUpperCase()) {
    const ch = LATIN_TO_CYR[raw] ?? (raw === 'Ё' ? 'Е' : raw);
    if (LETTER_SET.has(ch) || (ch >= '0' && ch <= '9')) out += ch;
  }
  return out;
}

export function isValidPlate(normalized: string): boolean {
  return FULL_RE.test(normalized);
}

/** Which kind of character is expected next, or null when the plate is full. */
export function nextSlot(normalized: string): 'L' | 'D' | null {
  if (normalized.length >= PLATE_MAX_LEN) return null;
  return PLATE_MASK[normalized.length];
}

/** Appends a key press if it fits the mask; otherwise returns the value unchanged. */
export function appendToPlate(normalized: string, key: string): string {
  const slot = nextSlot(normalized);
  if (!slot) return normalized;
  const ch = normalizePlate(key);
  if (ch.length !== 1) return normalized;
  const isDigit = ch >= '0' && ch <= '9';
  if ((slot === 'D') !== isDigit) return normalized;
  return normalized + ch;
}

/** First 6 characters (series + number), shared across regions. */
export function plateBase(normalized: string): string {
  return normalized.slice(0, PLATE_BASE_LEN);
}

export function plateRegion(normalized: string): string {
  return normalized.slice(PLATE_BASE_LEN);
}

/** «А123ВС77» → { main: 'А 123 ВС', region: '77' } — for the plate visual. */
export function splitPlate(normalized: string): { main: string; region: string } {
  const p = normalized;
  const main = [p.slice(0, 1), p.slice(1, 4), p.slice(4, 6)].filter(Boolean).join(' ');
  return { main, region: plateRegion(p) };
}

/** Single-line human form: «А 123 ВС 77». */
export function formatPlate(normalized: string): string {
  const { main, region } = splitPlate(normalized);
  return region ? `${main} ${region}` : main;
}
