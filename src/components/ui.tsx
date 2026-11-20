import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import type { Tone } from '../lib/labels';

/* ---------- Bottom sheet ---------- */

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Chips ---------- */

export function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  tone,
}: {
  options: { id: T; label: string; tone?: Tone }[];
  selected: T[];
  onToggle: (id: T) => void;
  tone?: Tone;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className={`chip ${on ? `on tone-${o.tone ?? tone ?? 'neutral'}` : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(o.id)}
          >
            {on && <Icon name="check" size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Single-choice row of equal-width buttons. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  allowNone = false,
  columns,
  compact = false,
}: {
  options: { id: T; label: string; tone?: Tone }[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  allowNone?: boolean;
  /** Wrap into a grid with this many columns instead of a single row. */
  columns?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`segmented ${compact ? 'segmented-compact' : ''}`}
      role="radiogroup"
      style={columns ? { gridAutoFlow: 'row', gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`seg ${on ? `on tone-${o.tone ?? 'accent'}` : ''}`}
            onClick={() => onChange(on && allowNone ? null : o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stars({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} из 5`}
          className={`star ${value && n <= value ? 'on' : ''}`}
          onClick={() => onChange(value === n ? undefined : n)}
        >
          <Icon name="star" size={38} filled={!!value && n <= value} />
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Photos ---------- */

export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function Thumb({ blob, onOpen, onRemove }: { blob: Blob; onOpen?: () => void; onRemove?: () => void }) {
  const url = useObjectUrl(blob);
  return (
    <div className="thumb">
      {url && <img src={url} alt="" onClick={onOpen} />}
      {onRemove && (
        <button type="button" className="thumb-x" aria-label="Убрать фото" onClick={onRemove}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** Picks photos (camera or library — iOS asks) and previews them before saving. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="photos">
      {files.map((f, i) => (
        <Thumb key={i} blob={f} onRemove={() => onChange(files.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="thumb thumb-add" onClick={() => input.current?.click()}>
        <Icon name="camera" size={28} />
        <span>Фото</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onChange([...files, ...picked]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function PhotoStrip({ blobs }: { blobs: Blob[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!blobs.length) return null;
  return (
    <>
      <div className="photos">
        {blobs.map((b, i) => (
          <Thumb key={i} blob={b} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && <Lightbox blob={blobs[open]} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ blob, onClose }: { blob: Blob; onClose: () => void }) {
  const url = useObjectUrl(blob);
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      {url && <img src={url} alt="" />}
      <button type="button" className="icon-btn lightbox-x" aria-label="Закрыть">
        <Icon name="x" />
      </button>
    </div>,
    document.body,
  );
}

/* ---------- Toast with undo ---------- */

interface ToastState {
  id: number;
  text: string;
  undo?: () => void;
}
const ToastCtx = createContext<(text: string, undo?: () => void) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, undo?: () => void) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, undo });
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Отменить
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function ToneDot({ tone }: { tone: Tone }) {
  return <span className={`dot tone-${tone}`} aria-hidden="true" />;
}
