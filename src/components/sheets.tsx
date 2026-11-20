import { useState } from 'react';
import { DRAFT, useSessionState } from '../lib/hooks';
import type { ExternalCheck, ObservationSource, Severity, Vehicle, Verdict } from '../lib/db';
import {
  CATEGORIES,
  COMMON_MODELS,
  OBS_SOURCES,
  OUTCOMES,
  REJECT_REASONS,
  SEVERITIES,
  VERDICTS,
} from '../lib/labels';
import { formatPlate, isValidPlate, normalizePlate } from '../lib/plate';
import { ChipGroup, Field, PhotoPicker, Segmented, Sheet, Stars } from './ui';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function SaveButton({ onClick, label = 'Сохранить', busy }: { onClick: () => void; label?: string; busy?: boolean }) {
  return (
    <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={onClick}>
      {busy ? 'Сохраняю…' : label}
    </button>
  );
}

/** Run an async save once, keeping the sheet open on failure. */
function useSaving() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`Не удалось сохранить: ${(e as Error).message}`);
      setBusy(false);
    }
  };
  return { busy, run };
}

/* ---------- Decline (before booking, or after inspection) ---------- */

export interface DeclineResult {
  reasons: string[];
  comment?: string;
  blacklist: boolean;
}

export function DeclineSheet({
  afterInspection,
  onClose,
  onSave,
}: {
  afterInspection: boolean;
  onClose: () => void;
  onSave: (r: DeclineResult) => Promise<void>;
}) {
  const [reasons, setReasons] = useSessionState<string[]>(DRAFT + 'decline.reasons', []);
  const [comment, setComment] = useSessionState(DRAFT + 'decline.comment', '');
  const [blacklist, setBlacklist] = useSessionState(DRAFT + 'decline.blacklist', false);
  const { busy, run } = useSaving();
  return (
    <Sheet
      title={afterInspection ? 'Почему отменил?' : 'Почему не берёшь?'}
      onClose={onClose}
      footer={<SaveButton busy={busy} onClick={() => run(() => onSave({ reasons, comment, blacklist }))} />}
    >
      <ChipGroup options={REJECT_REASONS} selected={reasons} onToggle={(id) => setReasons(toggle(reasons, id))} tone="warn" />
      <Field label="Комментарий" hint="необязательно · 🎤 диктовка на клавиатуре">
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что не так?" />
      </Field>
      <label className="switch-row">
        <input type="checkbox" checked={blacklist} onChange={(e) => setBlacklist(e.target.checked)} />
        <span>
          <b>Больше не брать</b>
          <small>Пометить машину «Не брать»</small>
        </span>
      </label>
    </Sheet>
  );
}

/* ---------- Trip happened ---------- */

export interface TripResult {
  rating?: number;
  verdict?: Verdict | null;
  issues: string[];
  comment?: string;
  photos: File[];
}

const verdictFromRating = (r?: number): Verdict | undefined =>
  r === undefined ? undefined : r >= 4 ? 'RECOMMEND' : r === 3 ? 'NEUTRAL' : 'NOT_RECOMMEND';

export function TripSheet({
  currentVerdict,
  onClose,
  onSave,
}: {
  currentVerdict?: Verdict | null;
  onClose: () => void;
  onSave: (r: TripResult) => Promise<void>;
}) {
  const [rating, setRating] = useSessionState<number | undefined>(DRAFT + 'trip.rating', undefined);
  const [verdict, setVerdict] = useSessionState<Verdict | null | undefined>(DRAFT + 'trip.verdict', currentVerdict ?? undefined);
  const [verdictTouched, setVerdictTouched] = useSessionState(DRAFT + 'trip.verdictTouched', false);
  const [issues, setIssues] = useSessionState<string[]>(DRAFT + 'trip.issues', []);
  const [comment, setComment] = useSessionState(DRAFT + 'trip.comment', '');
  const [photos, setPhotos] = useState<File[]>([]);
  const { busy, run } = useSaving();

  return (
    <Sheet
      title="Как поездка?"
      onClose={onClose}
      footer={
        <SaveButton
          busy={busy}
          onClick={() => run(() => onSave({ rating, verdict: verdictTouched || rating ? verdict : undefined, issues, comment, photos }))}
        />
      }
    >
      <Stars
        value={rating}
        onChange={(r) => {
          setRating(r);
          // Suggest a verdict from the rating until the user picks one explicitly.
          if (!verdictTouched) setVerdict(verdictFromRating(r) ?? currentVerdict ?? undefined);
        }}
      />
      <Field label="Брать её снова?">
        <Segmented
          options={VERDICTS}
          value={verdict}
          allowNone
          columns={2}
          onChange={(v) => {
            setVerdict(v);
            setVerdictTouched(true);
          }}
        />
      </Field>
      <Field label="Замечания" hint="если были">
        <ChipGroup options={CATEGORIES} selected={issues} onToggle={(id) => setIssues(toggle(issues, id))} tone="warn" />
      </Field>
      <Field label="Комментарий" hint="🎤 диктовка на клавиатуре">
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Как ехала, что запомнилось" />
      </Field>
      <PhotoPicker files={photos} onChange={setPhotos} />
    </Sheet>
  );
}

/* ---------- Observation ---------- */

export interface NoteResult {
  category: string;
  severity: Severity;
  sourceType: ObservationSource;
  description?: string;
  photos: File[];
}

export function NoteSheet({ onClose, onSave }: { onClose: () => void; onSave: (r: NoteResult) => Promise<void> }) {
  const [category, setCategory] = useSessionState<string | undefined>(DRAFT + 'note.category', undefined);
  const [severity, setSeverity] = useSessionState<Severity | null>(DRAFT + 'note.severity', null);
  const [source, setSource] = useSessionState<ObservationSource>(DRAFT + 'note.source', 'PERSONAL_INSPECTION');
  const [text, setText] = useSessionState(DRAFT + 'note.text', '');
  const [photos, setPhotos] = useState<File[]>([]);
  const { busy, run } = useSaving();
  const empty = !category && !text.trim() && !photos.length;

  return (
    <Sheet
      title="Заметка"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || empty}
          onClick={() =>
            run(() =>
              onSave({
                category: category ?? 'other',
                severity: severity ?? (category ? 'UNKNOWN' : 'INFO'),
                sourceType: source,
                description: text,
                photos,
              }),
            )
          }
        >
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      }
    >
      <PhotoPicker files={photos} onChange={setPhotos} />
      <Field label="Текст" hint="🎤 диктовка на клавиатуре">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Что заметили" />
      </Field>
      <Field label="Что именно">
        <ChipGroup
          options={CATEGORIES}
          selected={category ? [category] : []}
          onToggle={(id) => setCategory(category === id ? undefined : id)}
        />
      </Field>
      <Field label="Насколько серьёзно">
        <Segmented options={SEVERITIES} value={severity} allowNone onChange={setSeverity} />
      </Field>
      <Field label="Откуда известно">
        <Segmented options={OBS_SOURCES} value={source} onChange={(v) => v && setSource(v)} />
      </Field>
    </Sheet>
  );
}

/* ---------- External check result ---------- */

export interface ExternalResult {
  outcome?: ExternalCheck['outcome'];
  summary?: string;
  reportUrl?: string;
  year?: number;
  model?: string;
}

export function ExternalResultSheet({
  sourceLabel,
  check,
  vehicle,
  onClose,
  onSave,
}: {
  sourceLabel: string;
  check: ExternalCheck;
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (r: ExternalResult) => Promise<void>;
}) {
  const [outcome, setOutcome] = useSessionState(DRAFT + 'externalresult.outcome', check.outcome);
  const [summary, setSummary] = useSessionState(DRAFT + 'externalresult.summary', check.summary ?? '');
  const [url, setUrl] = useSessionState(DRAFT + 'externalresult.url', check.reportUrl ?? '');
  const [year, setYear] = useSessionState(DRAFT + 'externalresult.year', vehicle.year ? String(vehicle.year) : '');
  const [model, setModel] = useSessionState(DRAFT + 'externalresult.model', [vehicle.make, vehicle.model].filter(Boolean).join(' '));
  const { busy, run } = useSaving();
  return (
    <Sheet
      title={`Итог: ${sourceLabel}`}
      onClose={onClose}
      footer={
        <SaveButton
          busy={busy}
          onClick={() =>
            run(() =>
              onSave({ outcome: outcome ?? undefined, summary, reportUrl: url, year: parseYear(year), model: model.trim() || undefined }),
            )
          }
        />
      }
    >
      <Field label="Что показал отчёт">
        <Segmented options={OUTCOMES} value={outcome} allowNone onChange={(v) => setOutcome(v ?? undefined)} />
      </Field>
      <Field label="Коротко" hint="ДТП, пробег, ремонты">
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Напр.: 2 ДТП, пробег 140 тыс." />
      </Field>
      <div className="field-row">
        <Field label="Год">
          <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="2021" />
        </Field>
        <Field label="Марка и модель">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Kia Rio" list="models" />
        </Field>
      </div>
      <Field label="Ссылка на отчёт" hint="необязательно">
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <ModelsDatalist />
    </Sheet>
  );
}

/* ---------- Edit car ---------- */

const COLORS = ['Белый', 'Серый', 'Серебристый', 'Чёрный', 'Синий', 'Красный', 'Оранжевый', 'Зелёный'];

export interface VehicleEdit {
  plate: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  verdict: Verdict | null;
  notes?: string;
}

export function splitModel(full: string): { make?: string; model?: string } {
  const s = full.trim().replace(/\s+/g, ' ');
  if (!s) return {};
  const i = s.indexOf(' ');
  return i < 0 ? { make: s } : { make: s.slice(0, i), model: s.slice(i + 1) };
}

const parseYear = (s: string) => {
  const n = Number(s);
  return n >= 1980 && n <= 2100 ? n : undefined;
};

export function EditVehicleSheet({
  vehicle,
  knownModels,
  onClose,
  onSave,
}: {
  vehicle: Vehicle;
  knownModels: string[];
  onClose: () => void;
  onSave: (r: VehicleEdit) => Promise<void>;
}) {
  const [plate, setPlate] = useSessionState(DRAFT + 'editvehicle.plate', formatPlate(vehicle.plate));
  const [model, setModel] = useSessionState(DRAFT + 'editvehicle.model', [vehicle.make, vehicle.model].filter(Boolean).join(' '));
  const [year, setYear] = useSessionState(DRAFT + 'editvehicle.year', vehicle.year ? String(vehicle.year) : '');
  const [color, setColor] = useSessionState(DRAFT + 'editvehicle.color', vehicle.color ?? '');
  const [verdict, setVerdict] = useSessionState<Verdict | null>(DRAFT + 'editvehicle.verdict', vehicle.verdict ?? null);
  const [notes, setNotes] = useSessionState(DRAFT + 'editvehicle.notes', vehicle.notes ?? '');
  const { busy, run } = useSaving();
  const normalized = normalizePlate(plate);
  const plateOk = isValidPlate(normalized);
  const suggestions = [...new Set([...knownModels, ...COMMON_MODELS])].slice(0, 12);

  return (
    <Sheet
      title="Данные машины"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !plateOk}
          onClick={() =>
            run(() =>
              onSave({
                plate: normalized,
                ...splitModel(model),
                year: parseYear(year),
                color: color.trim() || undefined,
                verdict,
                notes: notes.trim() || undefined,
              }),
            )
          }
        >
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      }
    >
      <Field label="Марка и модель">
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Kia Rio" list="models" />
      </Field>
      <div className="chips chips-scroll">
        {suggestions.map((m) => (
          <button key={m} type="button" className={`chip ${model === m ? 'on tone-accent' : ''}`} onClick={() => setModel(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="field-row">
        <Field label="Год">
          <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="2021" />
        </Field>
        <Field label="Цвет">
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Белый" />
        </Field>
      </div>
      <div className="chips chips-scroll">
        {COLORS.map((c) => (
          <button key={c} type="button" className={`chip ${color === c ? 'on tone-accent' : ''}`} onClick={() => setColor(c)}>
            {c}
          </button>
        ))}
      </div>
      <Field label="Моё мнение">
        <Segmented options={VERDICTS} value={verdict} allowNone columns={2} onChange={setVerdict} />
      </Field>
      <Field label="Заметки о машине">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Постоянные особенности, на что смотреть" />
      </Field>
      <Field label="Госномер" hint={plateOk ? 'исправьте, если ошиблись при вводе' : 'формат: А 123 ВС 77'}>
        <input className={plateOk ? '' : 'invalid'} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoCapitalize="characters" />
      </Field>
      <ModelsDatalist extra={knownModels} />
    </Sheet>
  );
}

function ModelsDatalist({ extra = [] }: { extra?: string[] }) {
  return (
    <datalist id="models">
      {[...new Set([...extra, ...COMMON_MODELS])].map((m) => (
        <option key={m} value={m} />
      ))}
    </datalist>
  );
}
