import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plate } from '../components/Plate';
import { vehicleName } from '../components/VehicleRow';
import { ToneDot } from '../components/ui';
import { db } from '../lib/db';
import { STATUS_LABEL, STATUS_TONE, providerLabel, reasonLabel } from '../lib/labels';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

/** Every time a car was considered — including declines (PRD §7 «Проверки»). */
export function History() {
  const nav = useNavigate();
  const rows = useLiveQuery(async () => {
    const [reviews, vehicles, trips] = await Promise.all([
      db.reviews.orderBy('startedAt').reverse().limit(300).toArray(),
      db.vehicles.toArray(),
      db.trips.toArray(),
    ]);
    const byId = new Map(vehicles.map((v) => [v.id, v]));
    const tripByReview = new Map(trips.filter((t) => t.reviewId).map((t) => [t.reviewId!, t]));
    return reviews
      .map((r) => ({ r, v: byId.get(r.vehicleId)!, trip: tripByReview.get(r.id) }))
      .filter((x) => x.v);
  });

  if (!rows) return <div className="screen" />;

  const groups: { day: string; items: typeof rows }[] = [];
  for (const row of rows) {
    const day = dayFmt.format(new Date(row.r.startedAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(row);
    else groups.push({ day, items: [row] });
  }

  const stats = {
    checks: rows.length,
    trips: rows.filter((x) => x.r.status === 'COMPLETED').length,
    declines: rows.filter((x) => x.r.status === 'REJECTED' || x.r.status === 'CANCELLED_AFTER_INSPECTION').length,
  };

  return (
    <div className="screen">
      <h1 className="screen-title">История</h1>
      {rows.length > 0 && (
        <div className="stats">
          <div>
            <b>{stats.checks}</b>
            <span>проверок</span>
          </div>
          <div>
            <b>{stats.trips}</b>
            <span>поездок</span>
          </div>
          <div>
            <b>{stats.declines}</b>
            <span>отказов</span>
          </div>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="section-title">{g.day}</h3>
          {g.items.map(({ r, v, trip }) => (
            <button key={r.id} type="button" className="hrow" onClick={() => nav(`/car/${v.id}`)}>
              <time>{new Date(r.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
              <Plate value={v.plate} size="sm" />
              <span className="hrow-body">
                <span className="hrow-status">
                  <ToneDot tone={STATUS_TONE[r.status]} />
                  {STATUS_LABEL[r.status]}
                  {trip?.rating ? ` · ★${trip.rating}` : ''}
                </span>
                <span className="vrow-sub">
                  {[vehicleName(v), r.provider !== 'unknown' ? providerLabel(r.provider) : '', r.reasons.map(reasonLabel).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </section>
      ))}
      {!rows.length && <p className="muted center">Проверок пока не было</p>}
    </div>
  );
}
