import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Plate } from '../components/Plate';
import {
  DeclineSheet,
  EditVehicleSheet,
  ExternalResultSheet,
  NoteSheet,
  TripSheet,
  splitModel,
} from '../components/sheets';
import { Timeline } from '../components/Timeline';
import { vehicleName } from '../components/VehicleRow';
import { PhotoStrip, Segmented, Sheet, ToneDot, useToast } from '../components/ui';
import {
  addObservation,
  bookReview,
  completeTrip,
  declineReview,
  deleteEvent,
  deleteVehicle,
  ensureReview,
  isActiveReview,
  recordExternalOpen,
  revertReview,
  saveExternalResult,
  setReviewProvider,
  updateVehicle,
} from '../lib/actions';
import { db, type CarsharingProvider } from '../lib/db';
import { computeDigest, shortDate } from '../lib/digest';
import { clearDrafts, useSessionState, useVehicleData } from '../lib/hooks';
import { PROVIDERS, STATUS_LABEL, outcomeInfo, verdictInfo } from '../lib/labels';
import { formatPlate } from '../lib/plate';
import { buildSourceUrl, setSetting, useSetting } from '../lib/settings';
import { clearHomePlate } from './Home';

type SheetState =
  | null
  | { kind: 'decline'; afterInspection: boolean }
  | { kind: 'trip' }
  | { kind: 'note' }
  | { kind: 'edit' }
  | { kind: 'menu' }
  | { kind: 'external'; checkId: string };

export function VehicleScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const data = useVehicleData(id);
  const lastProvider = useSetting('lastProvider');
  const sources = useSetting('sources');
  // Kept in sessionStorage: iOS may reload the PWA after an app switch, and the open sheet must survive it.
  const [sheet, storeSheet] = useSessionState<SheetState>(`sheet:${id}`, null);
  // Opening, switching or closing a sheet always starts from a clean draft.
  const setSheet = (s: SheetState) => {
    clearDrafts();
    storeSheet(s);
  };
  const close = () => setSheet(null);

  if (data === undefined) return <div className="screen" />;
  if (data === null)
    return (
      <div className="screen">
        <TopBar onBack={() => nav('/')} />
        <p className="muted center">Машина не найдена</p>
      </div>
    );

  const { vehicle, reviews, trips, observations, externalChecks, attachments } = data;
  const active = [...reviews].sort((a, b) => b.startedAt - a.startedAt).find((r) => isActiveReview(r));
  const digest = computeDigest(data, active?.id);
  const provider: CarsharingProvider = active?.provider ?? lastProvider;
  const booked = active?.status === 'BOOKED';
  const name = vehicleName(vehicle);
  const sourceLabel = (sid: string) => sources.find((s) => s.id === sid)?.label ?? sid;
  const personalPhotos = attachments.filter((a) => !a.externalCheckId).map((a) => a.blob);

  const changeProvider = async (p: CarsharingProvider) => {
    await setSetting('lastProvider', p);
    if (active) await setReviewProvider(active.id, p);
  };

  const review = async () => active ?? (await ensureReview(vehicle.id, provider));

  const book = async () => {
    const r = await review();
    const prev = r.status;
    await bookReview(r.id);
    clearHomePlate();
    toast('Забронировано', () => revertReview(r.id, prev));
  };

  const decline = async (afterInspection: boolean, reasons: string[], comment: string | undefined, blacklist: boolean) => {
    const r = await review();
    const prevStatus = r.status;
    const prevVerdict = vehicle.verdict;
    await declineReview(r, afterInspection ? 'CANCELLED_AFTER_INSPECTION' : 'REJECTED', { reasons, comment, blacklist });
    close();
    clearHomePlate();
    // Straight back to the plate entry — the user is walking to the next car.
    nav('/', { replace: true });
    toast(afterInspection ? 'Отмена записана' : 'Отказ записан', () =>
      revertReview(r.id, prevStatus, blacklist ? { vehicleId: vehicle.id, value: prevVerdict } : undefined),
    );
  };

  const openSource = (sid: string) => {
    const src = sources.find((s) => s.id === sid)!;
    // Fire-and-forget: Safari only allows clipboard writes inside the tap handler.
    navigator.clipboard?.writeText(vehicle.plate).catch(() => {});
    void (async () => {
      const r = await review();
      await recordExternalOpen(vehicle.id, r.id, src.id);
    })();
    toast(`Номер ${formatPlate(vehicle.plate)} скопирован`);
  };

  return (
    <div className="screen screen-vehicle">
      <TopBar onBack={() => (history.length > 1 ? nav(-1) : nav('/'))} onMenu={() => setSheet({ kind: 'menu' })} />

      <div className="veh-head">
        <Plate value={vehicle.plate} size="lg" />
        <button type="button" className="veh-name" onClick={() => setSheet({ kind: 'edit' })}>
          {name || <span className="link">+ Марка, модель, год</span>}
          {vehicle.color && <span className="muted"> · {vehicle.color}</span>}
          {name && <Icon name="pencil" size={14} />}
        </button>
      </div>

      {/* Personal experience — the answer to "have I used this car before?" */}
      <section className={`verdict tone-bg-${digest.tone}`}>
        <div className="verdict-title">
          <ToneDot tone={digest.tone} />
          {digest.title}
        </div>
        {digest.isUnknown && !digest.facts.length ? (
          <p className="verdict-sub">Вы её ещё не проверяли и не ездили на ней. Посмотрите внешние источники ниже.</p>
        ) : (
          <ul className="facts">
            {digest.facts.map((f, i) => (
              <li key={i}>
                <ToneDot tone={f.tone} />
                {f.text}
              </li>
            ))}
          </ul>
        )}
        {vehicle.notes && <p className="verdict-note">{vehicle.notes}</p>}
      </section>

      {/* External data is visually separated from personal observations (FR-015). */}
      <section className="card card-external">
        <div className="card-head">
          <h3>
            <Icon name="globe" size={18} /> Внешние проверки
          </h3>
          <span className="muted">номер скопируется</span>
        </div>
        <div className="source-buttons">
          {sources.map((s) => {
            const last = externalChecks.filter((c) => c.source === s.id).sort((a, b) => b.requestedAt - a.requestedAt)[0];
            const oc = outcomeInfo(last?.outcome);
            return (
              <a
                key={s.id}
                className="source-btn"
                href={buildSourceUrl(s, vehicle.plate)}
                target="_blank"
                rel="noreferrer"
                onClick={() => openSource(s.id)}
              >
                <b>
                  {s.label} <Icon name="external" size={16} />
                </b>
                <small>
                  {last ? (
                    <>
                      {oc && <ToneDot tone={oc.tone} />}
                      {oc ? oc.label : 'открыт'} · {shortDate(last.requestedAt)}
                    </>
                  ) : (
                    'не проверялась'
                  )}
                </small>
              </a>
            );
          })}
        </div>
        {externalChecks
          .filter((c) => c.status === 'MANUAL')
          .sort((a, b) => b.requestedAt - a.requestedAt)
          .slice(0, 2)
          .map((c) => (
            <button key={c.id} type="button" className="pending-result" onClick={() => setSheet({ kind: 'external', checkId: c.id })}>
              <Icon name="pencil" size={16} /> Записать итог: {sourceLabel(c.source)}
            </button>
          ))}
      </section>

      <div className="now-row">
        <b>Сервис</b>
        <span className="muted">{active ? `${STATUS_LABEL[active.status]} · ${shortDate(active.startedAt)}` : 'нет активной проверки'}</span>
      </div>
      <Segmented
        compact
        options={PROVIDERS.filter((p) => p.id !== 'unknown').map((p) => ({ id: p.id, label: p.label }))}
        value={provider}
        onChange={(v) => v && changeProvider(v)}
      />

      {personalPhotos.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>
              <Icon name="camera" size={18} /> Мои фото
            </h3>
            <span className="muted">{personalPhotos.length}</span>
          </div>
          <PhotoStrip blobs={personalPhotos} />
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h3>
            <Icon name="clock" size={18} /> История
          </h3>
        </div>
        <Timeline
          reviews={reviews}
          trips={trips}
          observations={observations}
          externalChecks={externalChecks}
          attachments={attachments}
          sourceLabel={sourceLabel}
          onDelete={deleteEvent}
        />
      </section>

      <div className="action-bar">
        <button type="button" className="btn btn-round" aria-label="Заметка или фото" onClick={() => setSheet({ kind: 'note' })}>
          <Icon name="plus" size={26} />
        </button>
        {booked ? (
          <>
            <button type="button" className="btn btn-bad" onClick={() => setSheet({ kind: 'decline', afterInspection: true })}>
              Отменил
            </button>
            <button type="button" className="btn btn-good" onClick={() => setSheet({ kind: 'trip' })}>
              Поездка была
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-bad" onClick={() => setSheet({ kind: 'decline', afterInspection: false })}>
              Не брать
            </button>
            <button type="button" className="btn btn-good" onClick={book}>
              Беру
            </button>
          </>
        )}
      </div>

      {sheet?.kind === 'decline' && (
        <DeclineSheet
          afterInspection={sheet.afterInspection}
          onClose={close}
          onSave={(r) => decline(sheet.afterInspection, r.reasons, r.comment, r.blacklist)}
        />
      )}

      {sheet?.kind === 'trip' && (
        <TripSheet
          currentVerdict={vehicle.verdict}
          onClose={close}
          onSave={async (r) => {
            await completeTrip({ vehicleId: vehicle.id, reviewId: active?.id, provider, ...r });
            close();
            clearHomePlate();
            toast('Поездка сохранена');
          }}
        />
      )}

      {sheet?.kind === 'note' && (
        <NoteSheet
          onClose={close}
          onSave={async (r) => {
            await addObservation({ vehicleId: vehicle.id, reviewId: active?.id, ...r });
            close();
            toast('Заметка сохранена');
          }}
        />
      )}

      {sheet?.kind === 'external' &&
        (() => {
          const check = externalChecks.find((c) => c.id === sheet.checkId);
          if (!check) return null;
          return (
            <ExternalResultSheet
              sourceLabel={sourceLabel(check.source)}
              check={check}
              vehicle={vehicle}
              onClose={close}
              onSave={async (r) => {
                await saveExternalResult(
                  check.id,
                  { outcome: r.outcome, summary: r.summary, reportUrl: r.reportUrl },
                  { year: r.year, ...(r.model ? splitModel(r.model) : {}) },
                );
                close();
                toast('Итог проверки сохранён');
              }}
            />
          );
        })()}

      {sheet?.kind === 'edit' && <EditSheetLoader vehicleId={vehicle.id} onClose={close} />}

      {sheet?.kind === 'menu' && (
        <Sheet title={formatPlate(vehicle.plate)} onClose={close}>
          <div className="menu">
            <button type="button" onClick={() => setSheet({ kind: 'edit' })}>
              <Icon name="pencil" /> Изменить данные и мнение
            </button>
            <button type="button" onClick={() => setSheet({ kind: 'trip' })}>
              <Icon name="car" /> Добавить поездку
            </button>
            <button type="button" onClick={() => setSheet({ kind: 'note' })}>
              <Icon name="note" /> Добавить заметку или фото
            </button>
            {verdictInfo(vehicle.verdict) && (
              <button
                type="button"
                onClick={async () => {
                  await updateVehicle(vehicle.id, { verdict: null });
                  close();
                }}
              >
                <Icon name="x" /> Сбросить мнение «{verdictInfo(vehicle.verdict)!.label}»
              </button>
            )}
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (!confirm(`Удалить ${formatPlate(vehicle.plate)} и всю её историю?`)) return;
                await deleteVehicle(vehicle.id);
                close();
                clearHomePlate();
                nav('/', { replace: true });
                toast('Машина удалена');
              }}
            >
              <Icon name="trash" /> Удалить машину
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function EditSheetLoader({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const data = useVehicleData(vehicleId);
  const toast = useToast();
  // Models already in the base come first in the one-tap suggestions.
  const models = useLiveQuery(async () => {
    const all = await db.vehicles.orderBy('lastSeenAt').reverse().toArray();
    return [...new Set(all.map((v) => [v.make, v.model].filter(Boolean).join(' ')).filter(Boolean))];
  });
  if (!data || !models) return null;
  return (
    <EditVehicleSheet
      vehicle={data.vehicle}
      knownModels={models}
      onClose={onClose}
      onSave={async (r) => {
        if (r.plate !== data.vehicle.plate) {
          const clash = await db.vehicles.where('plate').equals(r.plate).first();
          if (clash) {
            alert(`Номер ${formatPlate(r.plate)} уже есть в базе у другой машины.`);
            return;
          }
        }
        await updateVehicle(vehicleId, {
          plate: r.plate,
          make: r.make,
          model: r.model,
          year: r.year,
          color: r.color,
          verdict: r.verdict,
          notes: r.notes,
        });
        onClose();
        toast('Сохранено');
      }}
    />
  );
}

function TopBar({ onBack, onMenu }: { onBack: () => void; onMenu?: () => void }) {
  return (
    <div className="topbar">
      <button type="button" className="icon-btn" aria-label="Назад" onClick={onBack}>
        <Icon name="back" size={28} />
      </button>
      {onMenu && (
        <button type="button" className="icon-btn" aria-label="Действия" onClick={onMenu}>
          <Icon name="more" size={28} />
        </button>
      )}
    </div>
  );
}
