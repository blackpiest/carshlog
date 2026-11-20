import { PLATE_MIN_LEN, splitPlate } from '../lib/plate';

/**
 * Visual Russian licence plate. In `editing` mode the remaining mask slots are shown
 * as faint placeholders and the next slot gets a caret, so it's obvious what to type.
 */
export function Plate({
  value,
  size = 'md',
  editing = false,
}: {
  value: string;
  size?: 'sm' | 'md' | 'lg';
  editing?: boolean;
}) {
  if (!editing) {
    const { main, region } = splitPlate(value);
    return (
      <span className={`plate plate-${size}`} aria-label={`Госномер ${main} ${region}`}>
        <span className="plate-main">{main}</span>
        <span className="plate-region">
          <span className="plate-region-num">{region || '—'}</span>
          <span className="plate-rus">RUS</span>
        </span>
      </span>
    );
  }

  // Editing: render each slot individually. Placeholders: А 000 АА 00(0).
  const placeholder = ['А', '0', '0', '0', 'А', 'А', '0', '0', '0'];
  const slot = (i: number) => {
    const ch = value[i];
    const isNext = i === value.length;
    const optional = i === 8 && !ch;
    return (
      <span key={i} className={`slot ${ch ? 'is-filled' : 'is-empty'} ${isNext ? 'is-next' : ''} ${optional ? 'is-optional' : ''}`}>
        {ch ?? placeholder[i]}
      </span>
    );
  };
  const mainSlots = [0, 1, 2, 3, 4, 5];
  const groupGap = (i: number) => (i === 1 || i === 4 ? ' gap-before' : '');
  return (
    <span className={`plate plate-${size} plate-editing`} aria-live="polite" aria-label={`Госномер ${value || 'пусто'}`}>
      <span className="plate-main">
        {mainSlots.map((i) => (
          <span key={i} className={`slot-wrap${groupGap(i)}`}>
            {slot(i)}
          </span>
        ))}
      </span>
      <span className="plate-region">
        <span className="plate-region-num">
          {slot(6)}
          {slot(7)}
          {value.length >= PLATE_MIN_LEN ? slot(8) : null}
        </span>
        <span className="plate-rus">RUS</span>
      </span>
    </span>
  );
}
