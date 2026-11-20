import type { Vehicle } from '../lib/db';
import { digestLine, type Digest } from '../lib/digest';
import { Plate } from './Plate';
import { ToneDot } from './ui';

export function vehicleName(v: Vehicle): string {
  const name = [v.make, v.model].filter(Boolean).join(' ');
  return [name, v.year].filter(Boolean).join(', ');
}

export function VehicleRow({
  vehicle,
  digest,
  onClick,
  extra,
}: {
  vehicle: Vehicle;
  digest: Digest;
  onClick: () => void;
  extra?: string;
}) {
  const name = vehicleName(vehicle);
  const line = extra ?? digestLine(digest);
  return (
    <button type="button" className={`vrow tone-edge-${digest.tone}`} onClick={onClick}>
      <Plate value={vehicle.plate} size="sm" />
      <span className="vrow-body">
        <span className="vrow-title">
          <ToneDot tone={digest.tone} />
          {digest.title}
        </span>
        <span className="vrow-sub">{[name, line].filter(Boolean).join(' · ') || 'Нет данных'}</span>
      </span>
    </button>
  );
}
