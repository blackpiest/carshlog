import { useEffect, useRef, useState } from 'react';
import { Field, useToast } from '../components/ui';
import { exportAll, importAll, shareOrDownload } from '../lib/backup';
import { shortDate } from '../lib/digest';
import { DEFAULT_SOURCES, setSetting, useSetting, type ExternalSource } from '../lib/settings';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function Settings() {
  const toast = useToast();
  const lastBackupAt = useSetting('lastBackupAt');
  const sources = useSetting('sources');
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState<{ persisted: boolean; usage?: number }>();

  useEffect(() => {
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, usage: est?.usage });
    })();
  }, []);

  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await exportAll();
      const date = new Date().toISOString().slice(0, 10);
      await shareOrDownload(blob, `carlog-${date}.json`);
      await setSetting('lastBackupAt', Date.now());
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    setBusy(true);
    try {
      const { vehicles } = await importAll(file);
      toast(`Восстановлено машин: ${vehicles}`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateSource = (id: string, urlTemplate: string) =>
    setSetting(
      'sources',
      sources.map((s): ExternalSource => (s.id === id ? { ...s, urlTemplate } : s)),
    );

  const backupStale = !lastBackupAt || Date.now() - lastBackupAt > 30 * 86_400_000;

  return (
    <div className="screen">
      <h1 className="screen-title">Ещё</h1>

      <section className="card">
        <div className="card-head">
          <h3>Резервная копия</h3>
          <span className={backupStale ? 'warn-text' : 'muted'}>
            {lastBackupAt ? `последняя ${shortDate(lastBackupAt)}` : 'ещё не делали'}
          </span>
        </div>
        <p className="muted small">
          Все данные хранятся только на этом телефоне. Сохраняйте копию в «Файлы» или iCloud, чтобы не потерять базу при смене
          телефона или очистке Safari.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={doExport}>
            Сохранить копию
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
            Восстановить
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = '';
          }}
        />
        {storage && (
          <p className="muted small">
            Занято: {storage.usage !== undefined ? formatBytes(storage.usage) : '—'} ·{' '}
            {storage.persisted ? 'хранилище защищено от очистки' : 'хранилище может быть очищено системой'}
          </p>
        )}
      </section>

      {!isStandalone() && (
        <section className="card">
          <div className="card-head">
            <h3>Установить на iPhone</h3>
          </div>
          <ol className="steps">
            <li>Откройте Carlog в Safari</li>
            <li>Нажмите «Поделиться» (квадрат со стрелкой вверх)</li>
            <li>Выберите «На экран „Домой“»</li>
          </ol>
          <p className="muted small">Так приложение откроется с одного касания, без адресной строки, и будет работать без сети.</p>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h3>Внешние источники</h3>
        </div>
        <p className="muted small">
          Адрес, который открывается по кнопке. Номер всегда копируется в буфер. Если знаете ссылку, ведущую сразу на отчёт, вставьте
          её с <code>{'{plate}'}</code> вместо номера (кириллицей) или <code>{'{plate_lat}'}</code> (латиницей, строчными).
        </p>
        {sources.map((s) => (
          <Field key={s.id} label={s.label}>
            <input
              key={s.urlTemplate}
              type="url"
              defaultValue={s.urlTemplate}
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.urlTemplate && updateSource(s.id, e.target.value.trim())}
            />
          </Field>
        ))}
        <button type="button" className="link-btn" onClick={() => setSetting('sources', DEFAULT_SOURCES)}>
          Вернуть по умолчанию
        </button>
      </section>

      <p className="muted small center">Carlog 0.1 · данные не покидают устройство</p>
    </div>
  );
}
