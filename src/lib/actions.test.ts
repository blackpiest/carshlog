import { beforeEach, describe, expect, it } from 'vitest';
import { completeTrip, declineReview, deleteEvent, ensureReview, getActiveReview, startCheck } from './actions';
import { db } from './db';
import { computeDigest, type VehicleData } from './digest';

async function load(vehicleId: string): Promise<VehicleData> {
  return {
    vehicle: (await db.vehicles.get(vehicleId))!,
    reviews: await db.reviews.where('vehicleId').equals(vehicleId).toArray(),
    trips: await db.trips.where('vehicleId').equals(vehicleId).toArray(),
    observations: await db.observations.where('vehicleId').equals(vehicleId).toArray(),
    externalChecks: await db.externalChecks.where('vehicleId').equals(vehicleId).toArray(),
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('startCheck', () => {
  it('creates a card for an unknown plate and opens a check session', async () => {
    const { vehicleId, isNew } = await startCheck('А123ВС77', 'citydrive');
    expect(isNew).toBe(true);
    const data = await load(vehicleId);
    expect(data.vehicle.plate).toBe('А123ВС77');
    expect(data.vehicle.plateBase).toBe('А123ВС');
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0].status).toBe('CHECKING');
  });

  it('does not duplicate the car or the open session when the plate is entered again', async () => {
    const a = await startCheck('А123ВС77', 'citydrive');
    const b = await startCheck('А123ВС77', 'yandex');
    expect(b.vehicleId).toBe(a.vehicleId);
    expect(b.isNew).toBe(false);
    expect(await db.vehicles.count()).toBe(1);
    expect(await db.reviews.count()).toBe(1);
  });

  it('opens a new session after the previous one was decided', async () => {
    const { vehicleId } = await startCheck('А123ВС77', 'citydrive');
    const r = (await getActiveReview(vehicleId))!;
    await declineReview(r, 'REJECTED', { reasons: ['far'] });
    await startCheck('А123ВС77', 'citydrive');
    expect(await db.reviews.count()).toBe(2);
  });
});

describe('decline → next encounter (scenarios A and E)', () => {
  it('keeps the car and shows the decline with its reason next time', async () => {
    const { vehicleId } = await startCheck('Е001КХ799', 'yandex');
    const r = (await getActiveReview(vehicleId))!;
    await declineReview(r, 'REJECTED', { reasons: ['wheel'], comment: 'спущено колесо' });

    // Next time the plate is typed, a new session opens — the digest excludes it.
    await startCheck('Е001КХ799', 'yandex');
    const active = await getActiveReview(vehicleId);
    const d = computeDigest(await load(vehicleId), active?.id);
    expect(d.title).toBe('Раньше отказывался');
    expect(d.tone).toBe('warn');
    expect(d.declineCount).toBe(1);
    expect(d.facts.map((f) => f.text).join(' ')).toMatch(/колесо/i);
  });

  it('blacklisting sets the verdict', async () => {
    const { vehicleId } = await startCheck('Е001КХ799', 'yandex');
    await declineReview((await getActiveReview(vehicleId))!, 'CANCELLED_AFTER_INSPECTION', { reasons: [], blacklist: true });
    const d = computeDigest(await load(vehicleId));
    expect(d.title).toBe('Не брать');
    expect(d.tone).toBe('bad');
  });
});

describe('trip (scenario C)', () => {
  it('records the trip, its issues and closes the session', async () => {
    const { vehicleId } = await startCheck('М555ММ50', 'citydrive');
    const r = await ensureReview(vehicleId, 'citydrive');
    await completeTrip({
      vehicleId,
      reviewId: r.id,
      provider: 'citydrive',
      rating: 5,
      verdict: 'RECOMMEND',
      issues: ['interior'],
      comment: 'Отличная',
      photos: [],
    });
    const data = await load(vehicleId);
    expect(data.reviews[0].status).toBe('COMPLETED');
    expect(data.trips).toHaveLength(1);
    expect(data.observations[0]).toMatchObject({ category: 'interior', sourceType: 'PERSONAL_TRIP', tripId: data.trips[0].id });
    const d = computeDigest(data);
    expect(d.title).toBe('Рекомендую');
    expect(d.tripCount).toBe(1);
    expect(d.avgRating).toBe(5);
  });

  it('deleting a trip removes its issues and session', async () => {
    const { vehicleId } = await startCheck('М555ММ50', 'citydrive');
    const r = (await getActiveReview(vehicleId))!;
    const tripId = await completeTrip({ vehicleId, reviewId: r.id, provider: 'citydrive', issues: ['wheel'], photos: [] });
    await deleteEvent('trip', tripId);
    const data = await load(vehicleId);
    expect(data.trips).toHaveLength(0);
    expect(data.observations).toHaveLength(0);
    expect(data.reviews).toHaveLength(0);
  });
});

describe('digest', () => {
  it('never shows a positive verdict when nothing is known (PRD §9.4)', async () => {
    const { vehicleId } = await startCheck('А777АА77', 'citydrive');
    const active = await getActiveReview(vehicleId);
    const d = computeDigest(await load(vehicleId), active?.id);
    expect(d.title).toBe('Новая машина');
    expect(d.tone).toBe('neutral');
    expect(d.isUnknown).toBe(true);
  });
});

describe('digest — external checks', () => {
  it('shows the recorded outcome of an external source, labelled as external', async () => {
    const { recordExternalOpen, saveExternalResult } = await import('./actions');
    const { vehicleId } = await startCheck('В200ОР99', 'citydrive');
    const active = await getActiveReview(vehicleId);
    const checkId = await recordExternalOpen(vehicleId, active?.id, 'avtocod');
    let d = computeDigest(await load(vehicleId), active?.id);
    expect(d.facts.map((f) => f.text)).toContainEqual(expect.stringMatching(/^Автокод: открывал .* итог не записан$/));

    await saveExternalResult(checkId, { outcome: 'BAD', summary: '3 ДТП' }, { year: 2019 });
    const data = await load(vehicleId);
    d = computeDigest(data, active?.id);
    expect(d.facts).toContainEqual({ tone: 'bad', text: expect.stringMatching(/^Автокод: плохо — 3 ДТП/) });
    expect(data.vehicle.year).toBe(2019);
    // External data alone is not a personal verdict.
    expect(d.title).toBe('Новая машина');
  });

  it('re-opening the same source shortly after does not create a duplicate record', async () => {
    const { recordExternalOpen } = await import('./actions');
    const { vehicleId } = await startCheck('В200ОР99', 'citydrive');
    const a = await recordExternalOpen(vehicleId, undefined, 'nomerogram');
    const b = await recordExternalOpen(vehicleId, undefined, 'nomerogram');
    expect(b).toBe(a);
    expect(await db.externalChecks.count()).toBe(1);
  });
});
