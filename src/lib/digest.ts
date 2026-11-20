import type { ExternalCheck, Observation, Vehicle, VehicleReview, VehicleTrip } from './db';
import { SEVERITY_RANK, SOURCE_LABELS, categoryLabel, outcomeInfo, reasonLabel, verdictInfo, type Tone } from './labels';

export interface VehicleData {
  vehicle: Vehicle;
  reviews: VehicleReview[];
  trips: VehicleTrip[];
  observations: Observation[];
  externalChecks: ExternalCheck[];
}

export interface Fact {
  tone: Tone;
  text: string;
}

export interface Digest {
  /** Headline shown in the big banner. */
  title: string;
  tone: Tone;
  /** Short explainable facts (PRD §9.5) — no opaque score. */
  facts: Fact[];
  tripCount: number;
  avgRating?: number;
  declineCount: number;
  /** True when there is nothing personal about this car yet. */
  isUnknown: boolean;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

export function shortDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  return d.getFullYear() === new Date(now).getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d);
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
export const pluralTrips = (n: number) => plural(n, 'поездка', 'поездки', 'поездок');
export const pluralDeclines = (n: number) => plural(n, 'отказ', 'отказа', 'отказов');

/**
 * Turns everything known about a car into a verdict banner + a few facts.
 * `excludeReviewId` hides the session that is happening right now, so a car you've
 * just typed in doesn't count as "already seen".
 */
export function computeDigest(data: VehicleData, excludeReviewId?: string, now = Date.now()): Digest {
  const { vehicle } = data;
  const reviews = data.reviews.filter((r) => r.id !== excludeReviewId);
  const trips = [...data.trips].sort((a, b) => b.startedAt - a.startedAt);
  const declines = reviews
    .filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED_AFTER_INSPECTION')
    .sort((a, b) => b.startedAt - a.startedAt);
  const rated = trips.filter((t) => t.rating);
  const avgRating = rated.length ? rated.reduce((s, t) => s + t.rating!, 0) / rated.length : undefined;

  const facts: Fact[] = [];

  if (trips.length) {
    const ratingText = avgRating ? ` · ★ ${avgRating.toFixed(1).replace('.0', '')}` : '';
    facts.push({
      tone: avgRating === undefined ? 'neutral' : avgRating >= 4 ? 'good' : avgRating >= 3 ? 'neutral' : 'warn',
      text: `${pluralTrips(trips.length)}${ratingText}, последняя ${shortDate(trips[0].startedAt, now)}`,
    });
    const lastComment = trips.find((t) => t.comment)?.comment;
    if (lastComment) facts.push({ tone: 'neutral', text: `«${lastComment}»` });
  }

  for (const d of declines.slice(0, 2)) {
    const what = d.status === 'REJECTED' ? 'Отказался' : 'Отменил после осмотра';
    const why = d.reasons.length ? `: ${d.reasons.map(reasonLabel).join(', ').toLowerCase()}` : '';
    facts.push({ tone: d.status === 'REJECTED' ? 'warn' : 'bad', text: `${what} ${shortDate(d.startedAt, now)}${why}` });
    if (d.comment) facts.push({ tone: 'neutral', text: `«${d.comment}»` });
  }
  if (declines.length > 2) facts.push({ tone: 'warn', text: `и ещё ${pluralDeclines(declines.length - 2)}` });

  const issues = [...data.observations]
    .filter((o) => SEVERITY_RANK[o.severity] >= SEVERITY_RANK.MINOR)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.observedAt - a.observedAt);
  const seen = new Set<string>();
  for (const o of issues) {
    if (seen.has(o.category) || seen.size >= 3) continue;
    seen.add(o.category);
    const tone: Tone = o.severity === 'UNSAFE' ? 'bad' : o.severity === 'MAJOR' ? 'warn' : 'neutral';
    const detail = o.description ? ` — ${o.description}` : '';
    facts.push({ tone, text: `${categoryLabel(o.category)}${detail} (${shortDate(o.observedAt, now)})` });
  }

  // Latest check per external source, with its outcome — external facts stay labelled as such.
  const latestBySource = new Map<string, ExternalCheck>();
  for (const c of [...data.externalChecks].sort((a, b) => b.requestedAt - a.requestedAt)) {
    if (!latestBySource.has(c.source)) latestBySource.set(c.source, c);
  }
  for (const c of latestBySource.values()) {
    const label = SOURCE_LABELS[c.source] ?? c.source;
    const old = now - c.requestedAt > 180 * 86_400_000;
    const when = `${shortDate(c.requestedAt, now)}${old ? ', устарела' : ''}`;
    const oc = outcomeInfo(c.outcome);
    if (c.status === 'DONE' && (oc || c.summary)) {
      const summary = c.summary ? ` — ${c.summary}` : '';
      facts.push({ tone: old ? 'warn' : oc?.tone ?? 'neutral', text: `${label}: ${(oc?.label ?? 'итог').toLowerCase()}${summary} (${when})` });
    } else {
      facts.push({ tone: 'neutral', text: `${label}: открывал ${when}, итог не записан` });
    }
  }

  const v = verdictInfo(vehicle.verdict);
  const hasUnsafe = issues.some((o) => o.severity === 'UNSAFE');
  const hasMajor = issues.some((o) => o.severity === 'MAJOR');
  const isUnknown = !trips.length && !declines.length && !data.observations.length && !v;

  let title: string;
  let tone: Tone;
  if (v) {
    title = v.label;
    tone = v.tone;
  } else if (isUnknown) {
    // Absence of data is never "good" (PRD §9.4).
    title = reviews.length ? 'Смотрел раньше, без решения' : 'Новая машина';
    tone = 'neutral';
  } else if (hasUnsafe) {
    title = 'Были опасные замечания';
    tone = 'bad';
  } else if (declines.length && !trips.length) {
    title = 'Раньше отказывался';
    tone = 'warn';
  } else if (hasMajor) {
    title = 'Были серьёзные замечания';
    tone = 'warn';
  } else if (avgRating !== undefined && avgRating >= 4) {
    title = 'Ездил, всё было хорошо';
    tone = 'good';
  } else if (trips.length) {
    title = 'Ездил раньше';
    tone = 'neutral';
  } else {
    title = 'Есть заметки';
    tone = 'neutral';
  }

  return { title, tone, facts, tripCount: trips.length, avgRating, declineCount: declines.length, isUnknown };
}

/** One-line summary for list rows. */
export function digestLine(d: Digest): string {
  const parts: string[] = [];
  if (d.tripCount) parts.push(pluralTrips(d.tripCount) + (d.avgRating ? ` ★${d.avgRating.toFixed(1).replace('.0', '')}` : ''));
  if (d.declineCount) parts.push(pluralDeclines(d.declineCount));
  return parts.join(' · ');
}
