import { db, type Attachment } from './db';

const FORMAT = 'carlog-backup';
const VERSION = 1;

type SerializedAttachment = Omit<Attachment, 'blob'> & { dataUrl: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

/** Full export including photos (FR-024). The only backup while data lives on the phone. */
export async function exportAll(): Promise<Blob> {
  const attachments: SerializedAttachment[] = [];
  for (const a of await db.attachments.toArray()) {
    const { blob, ...rest } = a;
    attachments.push({ ...rest, dataUrl: await blobToDataUrl(blob) });
  }
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    vehicles: await db.vehicles.toArray(),
    reviews: await db.reviews.toArray(),
    trips: await db.trips.toArray(),
    observations: await db.observations.toArray(),
    externalChecks: await db.externalChecks.toArray(),
    settings: await db.settings.toArray(),
    attachments,
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

/**
 * Merges a backup into the current base: records with the same id are overwritten, others kept.
 * A car with the same plate but a different id is merged into the existing one.
 */
export async function importAll(file: File): Promise<{ vehicles: number }> {
  const data = JSON.parse(await file.text());
  if (data?.format !== FORMAT) throw new Error('Это не файл резервной копии Carlog');

  const attachments: Attachment[] = [];
  for (const a of (data.attachments ?? []) as SerializedAttachment[]) {
    const { dataUrl, ...rest } = a;
    attachments.push({ ...rest, blob: await dataUrlToBlob(dataUrl) });
  }

  await db.transaction(
    'rw',
    [db.vehicles, db.reviews, db.trips, db.observations, db.externalChecks, db.attachments, db.settings],
    async () => {
      // Remap incoming vehicles onto existing ones with the same plate (unique index).
      const remap = new Map<string, string>();
      for (const v of data.vehicles ?? []) {
        const existing = await db.vehicles.where('plate').equals(v.plate).first();
        if (existing && existing.id !== v.id) remap.set(v.id, existing.id);
        else await db.vehicles.put(v);
      }
      const fix = <T extends { vehicleId: string }>(rows: T[] = []) =>
        rows.map((r) => ({ ...r, vehicleId: remap.get(r.vehicleId) ?? r.vehicleId }));
      await db.reviews.bulkPut(fix(data.reviews));
      await db.trips.bulkPut(fix(data.trips));
      await db.observations.bulkPut(fix(data.observations));
      await db.externalChecks.bulkPut(fix(data.externalChecks));
      await db.attachments.bulkPut(fix(attachments));
      await db.settings.bulkPut(data.settings ?? []);
    },
  );
  return { vehicles: (data.vehicles ?? []).length };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** iOS: share sheet lets the user save straight to Files/iCloud — more reliable than a download. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Carlog — резервная копия' });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, filename);
}
