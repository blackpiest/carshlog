import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Keypad } from '../components/Keypad';
import { Plate } from '../components/Plate';
import { VehicleRow, vehicleName } from '../components/VehicleRow';
import { ToneDot, Segmented } from '../components/ui';
import { isActiveReview, startCheck } from '../lib/actions';
import { db } from '../lib/db';
import { shortDate } from '../lib/digest';
import { useAllVehicles, useSessionState } from '../lib/hooks';
import { PROVIDERS } from '../lib/labels';
import { appendToPlate, isValidPlate, normalizePlate, PLATE_BASE_LEN } from '../lib/plate';
import { setSetting, useSetting } from '../lib/settings';

export const HOME_PLATE_KEY = 'home.plate';
export const clearHomePlate = () => sessionStorage.removeItem(HOME_PLATE_KEY);

const RECENT_LIMIT = 6;

export function Home() {
  const nav = useNavigate();
  const [plate, setPlate] = useSessionState(HOME_PLATE_KEY, '');
  const provider = useSetting('lastProvider');
  const all = useAllVehicles();

  const activeBookings = useLiveQuery(async () => {
    const booked = await db.reviews.where('status').equals('BOOKED').toArray();
    return booked.filter((r) => isActiveReview(r));
  });

  const exact = useMemo(() => all?.find((x) => x.vehicle.plate === plate), [all, plate]);
  const candidates = useMemo(() => {
    if (!all || !plate) return [];
    return all.filter((x) => x.vehicle.plate.startsWith(plate) && x !== exact).slice(0, 5);
  }, [all, plate, exact]);
  // Same letters+digits but another region — likely a typo in the region, worth surfacing.
  const sameBase = useMemo(() => {
    if (!all || plate.length < PLATE_BASE_LEN + 2) return [];
    const base = plate.slice(0, PLATE_BASE_LEN);
    return all.filter((x) => x.vehicle.plateBase === base && !x.vehicle.plate.startsWith(plate));
  }, [all, plate]);

  const go = async (p: string) => {
    const { vehicleId } = await startCheck(p, provider);
    nav(`/car/${vehicleId}`);
  };

  const type = (k: string) => setPlate(appendToPlate(plate, k));
  const backspace = () => setPlate(plate.slice(0, -1));
  const clear = () => setPlate('');
  const valid = isValidPlate(plate);

  // Hardware keyboard (desktop, or iPad with keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet')) return;
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'Backspace') return backspace();
      if (e.key === 'Escape') return clear();
      if (e.key === 'Enter') return valid && go(plate);
      if (e.key.length === 1) type(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      let next = '';
      for (const ch of normalizePlate(text)) next = appendToPlate(next, ch);
      if (next) setPlate(next);
    } catch {
      /* clipboard denied — nothing to do */
    }
  };

  const recent = all?.slice(0, RECENT_LIMIT) ?? [];

  return (
    <div className="home">
      <header className="home-head">
        <Segmented
          options={PROVIDERS.filter((p) => p.id !== 'unknown').map((p) => ({ id: p.id, label: p.label }))}
          value={provider}
          onChange={(v) => v && setSetting('lastProvider', v)}
        />
      </header>

      <div className="home-plate">
        <Plate value={plate} size="lg" editing />
        {!plate && 'clipboard' in navigator && 'readText' in navigator.clipboard && (
          <button type="button" className="link-btn" onClick={paste}>
            <Icon name="paste" size={18} /> Вставить номер
          </button>
        )}
      </div>

      <div className="home-results">
        {exact ? (
          <button type="button" className={`match-card tone-bg-${exact.digest.tone}`} onClick={() => go(plate)}>
            <span className="match-kicker">{exact.digest.isUnknown ? 'Уже в базе' : 'Знакомая машина'}</span>
            <span className="match-title">
              <ToneDot tone={exact.digest.tone} />
              {exact.digest.title}
            </span>
            {vehicleName(exact.vehicle) && <span className="match-name">{vehicleName(exact.vehicle)}</span>}
            <ul className="facts">
              {exact.digest.facts.slice(0, 4).map((f, i) => (
                <li key={i}>
                  <ToneDot tone={f.tone} />
                  {f.text}
                </li>
              ))}
            </ul>
          </button>
        ) : valid ? (
          <div className="match-card tone-bg-neutral">
            <span className="match-kicker">Нет в базе</span>
            <span className="match-title">Новая машина</span>
            <span className="match-name">Нажмите «Проверить», чтобы открыть карточку и внешние проверки</span>
          </div>
        ) : null}

        {plate && candidates.length > 0 && (
          <section>
            <h3 className="section-title">{exact ? 'Похожие номера' : 'Совпадения в базе'}</h3>
            {candidates.map((c) => (
              <VehicleRow key={c.vehicle.id} vehicle={c.vehicle} digest={c.digest} onClick={() => go(c.vehicle.plate)} />
            ))}
          </section>
        )}
        {sameBase.length > 0 && (
          <section>
            <h3 className="section-title">Тот же номер, другой регион</h3>
            {sameBase.map((c) => (
              <VehicleRow key={c.vehicle.id} vehicle={c.vehicle} digest={c.digest} onClick={() => go(c.vehicle.plate)} />
            ))}
          </section>
        )}
        {plate && !exact && !valid && candidates.length === 0 && plate.length >= 4 && (
          <p className="muted center">В базе такого номера нет</p>
        )}

        {!plate && (
          <>
            {activeBookings?.map((r) => {
              const v = all?.find((x) => x.vehicle.id === r.vehicleId);
              if (!v) return null;
              return (
                <button key={r.id} type="button" className="booking-banner" onClick={() => nav(`/car/${v.vehicle.id}`)}>
                  <span>
                    <b>Забронирована</b> с {new Date(r.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Plate value={v.vehicle.plate} size="sm" />
                  <span className="booking-cta">Оценить поездку ›</span>
                </button>
              );
            })}
            {recent.length > 0 ? (
              <section>
                <h3 className="section-title">Недавние</h3>
                {recent.map((c) => (
                  <VehicleRow
                    key={c.vehicle.id}
                    vehicle={c.vehicle}
                    digest={c.digest}
                    extra={shortDate(c.vehicle.lastSeenAt)}
                    onClick={() => nav(`/car/${c.vehicle.id}`)}
                  />
                ))}
              </section>
            ) : (
              all && (
                <div className="empty">
                  <Icon name="car" size={40} />
                  <p>Введите госномер машины, которую видите в приложении каршеринга.</p>
                  <p className="muted">Carlog запомнит её, ваши решения и поездки.</p>
                </div>
              )
            )}
          </>
        )}
      </div>

      <Keypad
        value={plate}
        onKey={type}
        onBackspace={backspace}
        onClear={clear}
        onSubmit={() => go(plate)}
        canSubmit={valid}
        submitLabel={exact ? 'Открыть' : 'Проверить'}
      />
    </div>
  );
}
