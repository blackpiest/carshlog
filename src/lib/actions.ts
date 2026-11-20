import {
  db,
  uid,
  type CarsharingProvider,
  type ExternalCheck,
  type ExternalSourceId,
  type Observation,
  type ObservationSource,
  type ReviewStatus,
  type Severity,
  type Vehicle,
  type VehicleReview,
  type Verdict,
} from './db';
import { plateBase } from './plate';
import { compressImage } from './images';

const HOUR = 3_600_000;
/** A check session left open this long is still "the current one" when the plate is entered again. */
const CHECKING_REUSE_MS = 3 * HOUR;
const BOOKED_REUSE_MS = 24 * HOUR;
/** Re-tapping the same external source within this window doesn't create a second record. */
const EXTERNAL_REUSE_MS = 2 * HOUR;

export async function findVehicleByPlate(plate: string): Promise<Vehicle | undefined> {
  return db.vehicles.where('plate').equals(plate).first();
}

/** Known cars whose plate starts with what has been typed so far. */
export async function findCandidates(prefix: string, limit = 5): Promise<Vehicle[]> {
  if (!prefix) return [];
  return db.vehicles.where('plate').startsWith(prefix).limit(limit).toArray();
}

async function touch(vehicleId: string, patch: Partial<Vehicle> = {}) {
  const now = Date.now();
  await db.vehicles.update(vehicleId, { ...patch, lastSeenAt: now, updatedAt: now });
}

export function isActiveReview(r: VehicleReview, now = Date.now()): boolean {
  if (r.status === 'CHECKING') return now - r.startedAt < CHECKING_REUSE_MS;
  if (r.status === 'BOOKED') return now - r.startedAt < BOOKED_REUSE_MS;
  return false;
}

export async function getActiveReview(vehicleId: string): Promise<VehicleReview | undefined> {
  const reviews = await db.reviews.where('vehicleId').equals(vehicleId).reverse().sortBy('startedAt');
  return reviews.find((r) => isActiveReview(r));
}

/**
 * Entry point of the main scenario: the user typed a plate and pressed "Проверить".
 * Finds or creates the car (FR-003/004) and opens a check session (FR-005), reusing a
 * recent undecided one so that re-entering the plate doesn't create duplicates.
 */
export async function startCheck(
  plate: string,
  provider: CarsharingProvider,
): Promise<{ vehicleId: string; isNew: boolean }> {
  return db.transaction('rw', db.vehicles, db.reviews, async () => {
    const now = Date.now();
    let vehicle = await findVehicleByPlate(plate);
    const isNew = !vehicle;
    if (!vehicle) {
      vehicle = { id: uid(), plate, plateBase: plateBase(plate), createdAt: now, updatedAt: now, lastSeenAt: now };
      await db.vehicles.add(vehicle);
    } else {
      await touch(vehicle.id);
    }
    const active = await getActiveReview(vehicle.id);
    if (!active) {
      await db.reviews.add({
        id: uid(),
        vehicleId: vehicle.id,
        provider,
        status: 'CHECKING',
        startedAt: now,
        reasons: [],
      });
    }
    return { vehicleId: vehicle.id, isNew };
  });
}

/** Creates a session when the user acts on a car opened from the list (not via plate entry). */
export async function ensureReview(vehicleId: string, provider: CarsharingProvider): Promise<VehicleReview> {
  const active = await getActiveReview(vehicleId);
  if (active) return active;
  const review: VehicleReview = {
    id: uid(),
    vehicleId,
    provider,
    status: 'CHECKING',
    startedAt: Date.now(),
    reasons: [],
  };
  await db.reviews.add(review);
  return review;
}

export async function setReviewProvider(reviewId: string, provider: CarsharingProvider) {
  await db.reviews.update(reviewId, { provider });
}

export async function bookReview(reviewId: string) {
  await db.reviews.update(reviewId, { status: 'BOOKED' });
}

/** Reopens a booking for the "undo" toast. */
export async function revertReview(reviewId: string, status: ReviewStatus, verdict?: { vehicleId: string; value: Verdict | null | undefined }) {
  await db.reviews.update(reviewId, { status, endedAt: undefined, reasons: [], comment: undefined });
  if (verdict) await db.vehicles.update(verdict.vehicleId, { verdict: verdict.value ?? null });
}

export async function declineReview(
  review: VehicleReview,
  status: 'REJECTED' | 'CANCELLED_AFTER_INSPECTION',
  opts: { reasons: string[]; comment?: string; blacklist?: boolean },
) {
  await db.transaction('rw', db.reviews, db.vehicles, async () => {
    await db.reviews.update(review.id, {
      status,
      reasons: opts.reasons,
      comment: opts.comment?.trim() || undefined,
      endedAt: Date.now(),
    });
    await touch(review.vehicleId, opts.blacklist ? { verdict: 'BLACKLIST' } : {});
  });
}

export async function addPhotos(
  files: File[],
  link: { vehicleId: string; reviewId?: string; tripId?: string; observationId?: string; externalCheckId?: string },
) {
  for (const file of files) {
    const blob = await compressImage(file);
    await db.attachments.add({
      id: uid(),
      ...link,
      blob,
      mimeType: blob.type || file.type,
      size: blob.size,
      createdAt: Date.now(),
    });
  }
}

export interface TripInput {
  vehicleId: string;
  reviewId?: string;
  provider: CarsharingProvider;
  startedAt?: number;
  rating?: number;
  verdict?: Verdict | null;
  issues: string[];
  comment?: string;
  photos: File[];
}

/** Scenario C: the trip happened. Issues become observations so they surface in the car summary. */
export async function completeTrip(input: TripInput) {
  const now = Date.now();
  const tripId = uid();
  await db.transaction('rw', [db.trips, db.reviews, db.vehicles, db.observations], async () => {
    await db.trips.add({
      id: tripId,
      vehicleId: input.vehicleId,
      reviewId: input.reviewId,
      provider: input.provider,
      startedAt: input.startedAt ?? now,
      rating: input.rating,
      comment: input.comment?.trim() || undefined,
    });
    for (const category of input.issues) {
      await db.observations.add({
        id: uid(),
        vehicleId: input.vehicleId,
        reviewId: input.reviewId,
        tripId,
        category,
        severity: 'MINOR',
        sourceType: 'PERSONAL_TRIP',
        observedAt: now,
        createdAt: now,
      });
    }
    if (input.reviewId) await db.reviews.update(input.reviewId, { status: 'COMPLETED', endedAt: now });
    await touch(input.vehicleId, input.verdict !== undefined ? { verdict: input.verdict } : {});
  });
  if (input.photos.length) await addPhotos(input.photos, { vehicleId: input.vehicleId, reviewId: input.reviewId, tripId });
  return tripId;
}

export interface ObservationInput {
  vehicleId: string;
  reviewId?: string;
  category: string;
  severity: Severity;
  sourceType: ObservationSource;
  description?: string;
  photos: File[];
}

export async function addObservation(input: ObservationInput) {
  const now = Date.now();
  const obs: Observation = {
    id: uid(),
    vehicleId: input.vehicleId,
    reviewId: input.reviewId,
    category: input.category,
    severity: input.severity,
    sourceType: input.sourceType,
    description: input.description?.trim() || undefined,
    observedAt: now,
    createdAt: now,
  };
  await db.observations.add(obs);
  await touch(input.vehicleId);
  if (input.photos.length)
    await addPhotos(input.photos, { vehicleId: input.vehicleId, reviewId: input.reviewId, observationId: obs.id });
  return obs.id;
}

/** Records that the user opened an external source (FR-010/011) — the date matters even without a result. */
export async function recordExternalOpen(vehicleId: string, reviewId: string | undefined, source: ExternalSourceId) {
  const now = Date.now();
  const recent = (await db.externalChecks.where('vehicleId').equals(vehicleId).toArray()).find(
    (c) => c.source === source && now - c.requestedAt < EXTERNAL_REUSE_MS,
  );
  if (recent) return recent.id;
  const id = uid();
  await db.externalChecks.add({ id, vehicleId, reviewId, source, status: 'MANUAL', requestedAt: now });
  await touch(vehicleId);
  return id;
}

export async function saveExternalResult(
  checkId: string,
  patch: Pick<ExternalCheck, 'outcome' | 'summary' | 'reportUrl'>,
  vehiclePatch: Partial<Pick<Vehicle, 'make' | 'model' | 'year'>> = {},
) {
  const check = await db.externalChecks.get(checkId);
  if (!check) return;
  await db.externalChecks.update(checkId, {
    ...patch,
    summary: patch.summary?.trim() || undefined,
    reportUrl: patch.reportUrl?.trim() || undefined,
    status: 'DONE',
    completedAt: Date.now(),
  });
  const clean = Object.fromEntries(Object.entries(vehiclePatch).filter(([, v]) => v !== undefined && v !== ''));
  await touch(check.vehicleId, clean);
}

export async function updateVehicle(id: string, patch: Partial<Vehicle>) {
  if (patch.plate) patch.plateBase = plateBase(patch.plate);
  await touch(id, patch);
}

export async function setVerdict(id: string, verdict: Verdict | null) {
  await touch(id, { verdict });
}

export async function deleteVehicle(id: string) {
  await db.transaction(
    'rw',
    [db.vehicles, db.reviews, db.trips, db.observations, db.externalChecks, db.attachments],
    async () => {
      await db.reviews.where('vehicleId').equals(id).delete();
      await db.trips.where('vehicleId').equals(id).delete();
      await db.observations.where('vehicleId').equals(id).delete();
      await db.externalChecks.where('vehicleId').equals(id).delete();
      await db.attachments.where('vehicleId').equals(id).delete();
      await db.vehicles.delete(id);
    },
  );
}

export async function deleteEvent(kind: 'review' | 'trip' | 'obs' | 'ext', id: string) {
  await db.transaction('rw', [db.reviews, db.trips, db.observations, db.externalChecks, db.attachments], async () => {
    if (kind === 'obs') {
      await db.attachments.where('observationId').equals(id).delete();
      await db.observations.delete(id);
    } else if (kind === 'ext') {
      await db.attachments.where('externalCheckId').equals(id).delete();
      await db.externalChecks.delete(id);
    } else if (kind === 'trip') {
      const trip = await db.trips.get(id);
      await db.observations.where('tripId').equals(id).delete();
      await db.attachments.where('tripId').equals(id).delete();
      await db.trips.delete(id);
      // The session that ended with this trip has no meaning without it.
      if (trip?.reviewId) await db.reviews.delete(trip.reviewId);
    } else {
      await db.attachments.where('reviewId').equals(id).filter((a) => !a.tripId && !a.observationId).delete();
      await db.reviews.delete(id);
    }
  });
}
