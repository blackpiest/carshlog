import { useRef } from 'react';
import { PLATE_LETTERS, nextSlot } from '../lib/plate';
import { Icon } from './Icon';

/**
 * On-screen plate keypad. Shows only the 12 legal letters or the 10 digits, switching by
 * the plate mask, so there is no keyboard-layout switching and keys are glove-sized.
 */
export function Keypad({
  value,
  onKey,
  onBackspace,
  onClear,
  onSubmit,
  canSubmit,
  submitLabel,
}: {
  value: string;
  onKey: (k: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitLabel: string;
}) {
  const slot = nextSlot(value);
  const mode = slot === 'L' ? 'letters' : 'digits';
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);

  // Press-and-hold backspace clears the whole plate.
  const startHold = () => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      onClear();
    }, 500);
  };
  const endHold = () => window.clearTimeout(holdTimer.current);

  const keys = mode === 'letters' ? PLATE_LETTERS : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const full = slot === null;

  return (
    <div className={`keypad keypad-${mode}`} role="group" aria-label="Клавиатура госномера">
      <div className="keypad-grid">
        {keys.map((k) => (
          <button key={k} type="button" className="key" disabled={full} onPointerDown={(e) => e.preventDefault()} onClick={() => onKey(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="keypad-row">
        <button
          type="button"
          className="key key-fn"
          aria-label="Стереть (удерживайте — очистить)"
          disabled={!value}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onClick={() => {
            if (!held.current) onBackspace();
          }}
        >
          <Icon name="backspace" size={26} />
        </button>
        {mode === 'digits' ? (
          <button type="button" className="key" disabled={full} onClick={() => onKey('0')}>
            0
          </button>
        ) : (
          <button type="button" className="key key-fn key-small" disabled={!value} onClick={onClear}>
            Сброс
          </button>
        )}
        <button type="button" className="key key-go" disabled={!canSubmit} onClick={onSubmit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
