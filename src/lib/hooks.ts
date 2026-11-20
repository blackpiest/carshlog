import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Vehicle } from './db';
import { computeDigest, type Digest, type VehicleData } from './digest';

export function useVehicleData(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null;
    const vehicle = await db.vehicles.get(id);
    if (!vehicle) return null;
    const [reviews, trips, observations, externalChecks, attachments] = await Promise.all([
      db.reviews.where('vehicleId').equals(id).toArray(),
      db.trips.where('vehicleId').equals(id).toArray(),
      db.observations.where('vehicleId').equals(id).toArray(),
      db.externalChecks.where('vehicleId').equals(id).toArray(),
      db.attachments.where('vehicleId').equals(id).toArray(),
    ]);
    return { vehicle, reviews, trips, observations, externalChecks, attachments };
  }, [id]);
}

export interface VehicleWithDigest {
  vehicle: Vehicle;
  digest: Digest;
  data: VehicleData;
}

/** Every car with its digest — the personal base is small (hundreds), so this is cheap. */
export function useAllVehicles(): VehicleWithDigest[] | undefined {
  return useLiveQuery(async () => {
    const [vehicles, reviews, trips, observations, externalChecks] = await Promise.all([
      db.vehicles.orderBy('lastSeenAt').reverse().toArray(),
      db.reviews.toArray(),
      db.trips.toArray(),
      db.observations.toArray(),
      db.externalChecks.toArray(),
    ]);
    const group = <T extends { vehicleId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.vehicleId, [...(m.get(r.vehicleId) ?? []), r]);
      return m;
    };
    const R = group(reviews);
    const T = group(trips);
    const O = group(observations);
    const E = group(externalChecks);
    return vehicles.map((vehicle) => {
      const data: VehicleData = {
        vehicle,
        reviews: R.get(vehicle.id) ?? [],
        trips: T.get(vehicle.id) ?? [],
        observations: O.get(vehicle.id) ?? [],
        externalChecks: E.get(vehicle.id) ?? [],
      };
      return { vehicle, data, digest: computeDigest(data) };
    });
  });
}

/**
 * useState mirrored to sessionStorage. Survives navigating away and back, and — important on iOS —
 * the silent page reload WebKit does when you switch apps and return to a home-screen PWA.
 */
export function useSessionState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      if (next === undefined) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private mode — ignore */
    }
  };
  return [v, set] as const;
}

/** Prefix for unsaved sheet input; wiped whenever a sheet closes so the next one starts clean. */
export const DRAFT = 'draft:';

export function clearDrafts() {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(DRAFT)) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
