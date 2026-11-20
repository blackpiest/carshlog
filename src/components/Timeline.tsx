import type { Attachment, ExternalCheck, Observation, VehicleReview, VehicleTrip } from '../lib/db';
import { shortDate } from '../lib/digest';
import {
  STATUS_LABEL,
  STATUS_TONE,
  categoryLabel,
  isExternalSource,
  obsSourceLabel,
  outcomeInfo,
  providerLabel,
  reasonLabel,
  severityLabel,
  type Tone,
} from '../lib/labels';
import { Icon, type IconName } from './Icon';
import { PhotoStrip } from './ui';

type Event =
  | { kind: 'review'; at: number; item: VehicleReview }
  | { kind: 'trip'; at: number; item: VehicleTrip }
  | { kind: 'obs'; at: number; item: Observation }
  | { kind: 'ext'; at: number; item: ExternalCheck };

const time = (ts: number) =>
  `${shortDate(ts)}, ${new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

export function Timeline({
  reviews,
  trips,
  observations,
  externalChecks,
  attachments,
  sourceLabel,
  onDelete,
}: {
  reviews: VehicleReview[];
  trips: VehicleTrip[];
  observations: Observation[];
  externalChecks: ExternalCheck[];
  attachments: Attachment[];
  sourceLabel: (id: string) => string;
  onDelete: (kind: Event['kind'], id: string) => void;
}) {
  const events: Event[] = [
    // A completed review is represented by its trip.
    ...reviews.filter((r) => r.status !== 'COMPLETED').map((item) => ({ kind: 'review' as const, at: item.startedAt, item })),
    ...trips.map((item) => ({ kind: 'trip' as const, at: item.startedAt, item })),
    // Trip issues are shown inside the trip.
    ...observations.filter((o) => !o.tripId).map((item) => ({ kind: 'obs' as const, at: item.observedAt, item })),
    ...externalChecks.map((item) => ({ kind: 'ext' as const, at: item.requestedAt, item })),
  ].sort((a, b) => b.at - a.at);

  if (!events.length) return <p className="muted">Пока пусто</p>;

  const photos = (pred: (a: Attachment) => boolean) => attachments.filter(pred).map((a) => a.blob);

  return (
    <ol className="timeline">
      {events.map((e) => {
        let icon: IconName;
        let tone: Tone = 'neutral';
        let title: string;
        const body: React.ReactNode[] = [];
        let blobs: Blob[] = [];
        let external = false;

        if (e.kind === 'review') {
          const r = e.item;
          icon = r.status === 'REJECTED' || r.status === 'CANCELLED_AFTER_INSPECTION' ? 'ban' : r.status === 'BOOKED' ? 'key' : 'eye';
          tone = STATUS_TONE[r.status];
          title = STATUS_LABEL[r.status];
          if (r.provider !== 'unknown') body.push(<span className="tl-meta">{providerLabel(r.provider)}</span>);
          if (r.reasons.length) body.push(<span>{r.reasons.map(reasonLabel).join(', ')}</span>);
          if (r.comment) body.push(<q>{r.comment}</q>);
          blobs = photos((a) => a.reviewId === r.id && !a.tripId && !a.observationId);
        } else if (e.kind === 'trip') {
          const t = e.item;
          icon = 'car';
          tone = t.rating === undefined ? 'neutral' : t.rating >= 4 ? 'good' : t.rating >= 3 ? 'neutral' : 'warn';
          title = t.rating ? `Поездка · ${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}` : 'Поездка';
          if (t.provider !== 'unknown') body.push(<span className="tl-meta">{providerLabel(t.provider)}</span>);
          const issues = observations.filter((o) => o.tripId === t.id);
          if (issues.length) body.push(<span>Замечания: {issues.map((o) => categoryLabel(o.category)).join(', ')}</span>);
          if (t.comment) body.push(<q>{t.comment}</q>);
          blobs = photos((a) => a.tripId === t.id);
        } else if (e.kind === 'obs') {
          const o = e.item;
          external = isExternalSource(o.sourceType);
          icon = external ? 'globe' : 'note';
          tone = o.severity === 'UNSAFE' ? 'bad' : o.severity === 'MAJOR' ? 'warn' : 'neutral';
          title = o.category === 'other' && o.description ? 'Заметка' : categoryLabel(o.category);
          body.push(
            <span className="tl-meta">
              {obsSourceLabel(o.sourceType)}
              {o.severity !== 'INFO' ? ` · ${severityLabel(o.severity)}` : ''}
            </span>,
          );
          if (o.description) body.push(<span>{o.description}</span>);
          blobs = photos((a) => a.observationId === o.id);
        } else {
          const c = e.item;
          external = true;
          icon = 'globe';
          const oc = outcomeInfo(c.outcome);
          tone = oc?.tone ?? 'neutral';
          title = `${sourceLabel(c.source)} · ${c.status === 'DONE' ? oc?.label ?? 'итог записан' : 'открыт, итог не записан'}`;
          if (c.summary) body.push(<span>{c.summary}</span>);
          if (c.reportUrl)
            body.push(
              <a href={c.reportUrl} target="_blank" rel="noreferrer">
                Открыть отчёт <Icon name="external" size={14} />
              </a>,
            );
          blobs = photos((a) => a.externalCheckId === c.id);
        }

        return (
          <li key={`${e.kind}-${e.item.id}`} className={`tl-item ${external ? 'tl-external' : ''}`}>
            <span className={`tl-icon tone-bg-${tone}`}>
              <Icon name={icon} size={18} />
            </span>
            <div className="tl-body">
              <div className="tl-head">
                <b>{title}</b>
                <time>{time(e.at)}</time>
              </div>
              {body.map((b, i) => (
                <div key={i} className="tl-line">
                  {b}
                </div>
              ))}
              <PhotoStrip blobs={blobs} />
              <button
                type="button"
                className="tl-del"
                onClick={() => confirm('Удалить эту запись?') && onDelete(e.kind, e.item.id)}
              >
                Удалить
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
