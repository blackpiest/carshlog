import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { VehicleRow, vehicleName } from '../components/VehicleRow';
import { useAllVehicles, type VehicleWithDigest } from '../lib/hooks';
import { normalizePlate } from '../lib/plate';

const FILTERS: { id: string; label: string; test: (x: VehicleWithDigest) => boolean }[] = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'trips', label: 'Ездил', test: (x) => x.digest.tripCount > 0 },
  { id: 'good', label: 'Рекомендую', test: (x) => x.vehicle.verdict === 'RECOMMEND' },
  { id: 'declined', label: 'Отказы', test: (x) => x.digest.declineCount > 0 },
  { id: 'black', label: 'Не брать', test: (x) => x.vehicle.verdict === 'BLACKLIST' || x.vehicle.verdict === 'NOT_RECOMMEND' },
];

export function Vehicles() {
  const nav = useNavigate();
  const all = useAllVehicles();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const list = useMemo(() => {
    if (!all) return [];
    const f = FILTERS.find((x) => x.id === filter)!;
    const plateQ = normalizePlate(q);
    const textQ = q.trim().toLowerCase();
    return all.filter((x) => {
      if (!f.test(x)) return false;
      if (!textQ) return true;
      return (plateQ && x.vehicle.plate.includes(plateQ)) || vehicleName(x.vehicle).toLowerCase().includes(textQ);
    });
  }, [all, q, filter]);

  return (
    <div className="screen">
      <h1 className="screen-title">Машины {all && <span className="muted">{all.length}</span>}</h1>
      <label className="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Номер или модель"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="chips chips-scroll">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip ${filter === f.id ? 'on tone-accent' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="list">
        {list.map((x) => (
          <VehicleRow key={x.vehicle.id} vehicle={x.vehicle} digest={x.digest} onClick={() => nav(`/car/${x.vehicle.id}`)} />
        ))}
        {all && !list.length && <p className="muted center">{all.length ? 'Ничего не нашлось' : 'База пока пуста'}</p>}
      </div>
    </div>
  );
}
