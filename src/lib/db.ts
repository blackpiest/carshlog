import Dexie, { type EntityTable } from 'dexie';

/* Entities mirror PRD §11 so a server/sync can be added later without remodelling. */

export type CarsharingProvider = 'citydrive' | 'yandex' | 'other' | 'unknown';

/** Personal standing of a car (FR-013). null — no opinion yet. */
export type Verdict = 'RECOMMEND' | 'NEUTRAL' | 'NOT_RECOMMEND' | 'BLACKLIST';

export type ReviewStatus =
  | 'CHECKING' // looked at it, no decision yet
  | 'BOOKED'
  | 'REJECTED' // declined before booking
  | 'CANCELLED_AFTER_INSPECTION'
  | 'COMPLETED'; // trip happened

export type Severity = 'INFO' | 'MINOR' | 'MAJOR' | 'UNSAFE' | 'UNKNOWN';

export type ObservationSource =
  | 'PERSONAL_INSPECTION'
  | 'PERSONAL_TRIP'
  | 'EXTERNAL_REPORT'
  | 'EXTERNAL_PHOTO'
  | 'USER_ASSUMPTION';

export type ExternalSourceId = 'avtocod' | 'nomerogram';

export interface Vehicle {
  id: string;
  /** Current normalized plate (Cyrillic, no spaces). Lookup key, not identity — see PRD §9.7. */
  plate: string;
  /** First 6 chars of the plate, for region-agnostic matching. */
  plateBase: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  vin?: string;
  verdict?: Verdict | null;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  /** Last time the user looked this car up or added anything to it. */
  lastSeenAt: number;
}

export interface VehicleReview {
  id: string;
  vehicleId: string;
  provider: CarsharingProvider;
  status: ReviewStatus;
  startedAt: number;
  endedAt?: number;
  /** Reason ids from REJECT_REASONS (and free-form ones). */
  reasons: string[];
  comment?: string;
}

export interface VehicleTrip {
  id: string;
  vehicleId: string;
  reviewId?: string;
  provider: CarsharingProvider;
  startedAt: number;
  /** 1–5, or undefined for "no rating". */
  rating?: number;
  comment?: string;
}

export interface Observation {
  id: string;
  vehicleId: string;
  reviewId?: string;
  tripId?: string;
  category: string;
  severity: Severity;
  sourceType: ObservationSource;
  description?: string;
  observedAt: number;
  createdAt: number;
}

export interface ExternalCheck {
  id: string;
  vehicleId: string;
  reviewId?: string;
  source: ExternalSourceId;
  /** MANUAL — opened by hand; DONE — the user saved a result. */
  status: 'MANUAL' | 'DONE';
  requestedAt: number;
  completedAt?: number;
  reportUrl?: string;
  summary?: string;
  /** Outcome as judged by the user. Absence is never treated as "OK" (PRD §9.4). */
  outcome?: 'CLEAN' | 'WARNING' | 'BAD' | 'NO_DATA';
}

export interface Attachment {
  id: string;
  vehicleId: string;
  reviewId?: string;
  tripId?: string;
  observationId?: string;
  externalCheckId?: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  caption?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export class CarlogDB extends Dexie {
  vehicles!: EntityTable<Vehicle, 'id'>;
  reviews!: EntityTable<VehicleReview, 'id'>;
  trips!: EntityTable<VehicleTrip, 'id'>;
  observations!: EntityTable<Observation, 'id'>;
  externalChecks!: EntityTable<ExternalCheck, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = 'carlog') {
    super(name);
    this.version(1).stores({
      vehicles: 'id, &plate, plateBase, lastSeenAt, verdict, make',
      reviews: 'id, vehicleId, startedAt, status',
      trips: 'id, vehicleId, reviewId, startedAt',
      observations: 'id, vehicleId, reviewId, tripId, observedAt',
      externalChecks: 'id, vehicleId, reviewId, requestedAt',
      attachments: 'id, vehicleId, reviewId, tripId, observationId, externalCheckId, createdAt',
      settings: 'key',
    });
  }
}

export const db = new CarlogDB();

/** UUID v4. crypto.randomUUID is missing on plain-http LAN testing, so fall back to getRandomValues. */
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
