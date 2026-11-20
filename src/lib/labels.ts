import type {
  CarsharingProvider,
  ExternalCheck,
  ObservationSource,
  ReviewStatus,
  Severity,
  Verdict,
} from './db';

export const PROVIDERS: { id: CarsharingProvider; label: string; short: string }[] = [
  { id: 'citydrive', label: 'Ситидрайв', short: 'СД' },
  { id: 'yandex', label: 'Яндекс Драйв', short: 'ЯД' },
  { id: 'other', label: 'Другой', short: 'Др' },
  { id: 'unknown', label: 'Не указан', short: '—' },
];
export const providerLabel = (p: CarsharingProvider) => PROVIDERS.find((x) => x.id === p)?.label ?? p;

export const VERDICTS: { id: Verdict; label: string; tone: Tone }[] = [
  { id: 'RECOMMEND', label: 'Рекомендую', tone: 'good' },
  { id: 'NEUTRAL', label: 'Нейтрально', tone: 'neutral' },
  { id: 'NOT_RECOMMEND', label: 'Не рекомендую', tone: 'warn' },
  { id: 'BLACKLIST', label: 'Не брать', tone: 'bad' },
];
export const verdictInfo = (v?: Verdict | null) => VERDICTS.find((x) => x.id === v);

export type Tone = 'good' | 'neutral' | 'warn' | 'bad';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  CHECKING: 'Смотрел, без решения',
  BOOKED: 'Забронировал',
  REJECTED: 'Отказался',
  CANCELLED_AFTER_INSPECTION: 'Отменил после осмотра',
  COMPLETED: 'Поездка',
};
export const STATUS_TONE: Record<ReviewStatus, Tone> = {
  CHECKING: 'neutral',
  BOOKED: 'neutral',
  REJECTED: 'warn',
  CANCELLED_AFTER_INSPECTION: 'bad',
  COMPLETED: 'good',
};

/** Reasons to decline a car (FR-006). Ordered by how often they come up. */
export const REJECT_REASONS: { id: string; label: string }[] = [
  { id: 'bad_history', label: 'Плохая история / ДТП' },
  { id: 'old', label: 'Старая / большой пробег' },
  { id: 'body', label: 'Повреждения кузова' },
  { id: 'wheel', label: 'Колесо / шина' },
  { id: 'dirty', label: 'Грязно / запах' },
  { id: 'dashboard', label: 'Ошибки на панели' },
  { id: 'bad_past', label: 'Плохой прошлый опыт' },
  { id: 'far', label: 'Далеко' },
  { id: 'price', label: 'Дорого' },
  { id: 'found_better', label: 'Нашёл получше' },
  { id: 'model', label: 'Не та модель' },
  { id: 'other', label: 'Другое' },
];
export const reasonLabel = (id: string) => REJECT_REASONS.find((r) => r.id === id)?.label ?? id;

/** Problem categories (PRD §10). */
export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'wheel', label: 'Колесо / шина' },
  { id: 'body', label: 'Кузов' },
  { id: 'glass', label: 'Стекло / оптика' },
  { id: 'dashboard', label: 'Ошибка на панели' },
  { id: 'engine', label: 'Двигатель / КПП' },
  { id: 'brakes', label: 'Тормоза / руль' },
  { id: 'suspension', label: 'Подвеска' },
  { id: 'interior', label: 'Салон / грязь' },
  { id: 'smell', label: 'Запах' },
  { id: 'electric', label: 'Свет / электрика' },
  { id: 'docs', label: 'Документы / комплект' },
  { id: 'other', label: 'Другое' },
];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const SEVERITIES: { id: Severity; label: string; tone: Tone }[] = [
  { id: 'INFO', label: 'Просто факт', tone: 'neutral' },
  { id: 'MINOR', label: 'Мелочь', tone: 'neutral' },
  { id: 'MAJOR', label: 'Серьёзно', tone: 'warn' },
  { id: 'UNSAFE', label: 'Опасно', tone: 'bad' },
];
export const SEVERITY_RANK: Record<Severity, number> = { UNSAFE: 4, MAJOR: 3, UNKNOWN: 2, MINOR: 1, INFO: 0 };
export const severityLabel = (s: Severity) => SEVERITIES.find((x) => x.id === s)?.label ?? 'Не оценено';

export const OBS_SOURCES: { id: ObservationSource; label: string }[] = [
  { id: 'PERSONAL_INSPECTION', label: 'Видел сам' },
  { id: 'EXTERNAL_REPORT', label: 'Из отчёта' },
  { id: 'EXTERNAL_PHOTO', label: 'На фото в отчёте' },
  { id: 'USER_ASSUMPTION', label: 'Подозреваю' },
];
export const obsSourceLabel = (s: ObservationSource) =>
  s === 'PERSONAL_TRIP' ? 'В поездке' : OBS_SOURCES.find((x) => x.id === s)?.label ?? s;
export const isExternalSource = (s: ObservationSource) => s === 'EXTERNAL_REPORT' || s === 'EXTERNAL_PHOTO';

export const OUTCOMES: { id: NonNullable<ExternalCheck['outcome']>; label: string; tone: Tone }[] = [
  { id: 'CLEAN', label: 'Чисто', tone: 'good' },
  { id: 'WARNING', label: 'Есть вопросы', tone: 'warn' },
  { id: 'BAD', label: 'Плохо', tone: 'bad' },
  { id: 'NO_DATA', label: 'Нет данных', tone: 'neutral' },
];
export const SOURCE_LABELS: Record<string, string> = { avtocod: 'Автокод', nomerogram: 'Номерограм' };

export const outcomeInfo =(o?: ExternalCheck['outcome']) => OUTCOMES.find((x) => x.id === o);

/** Popular carsharing models, offered as one-tap chips when filling in car details. */
export const COMMON_MODELS = [
  'Kia Rio',
  'Hyundai Solaris',
  'Volkswagen Polo',
  'Skoda Rapid',
  'Haval Jolion',
  'Chery Tiggo 4 Pro',
  'Chery Tiggo 7 Pro',
  'Geely Coolray',
  'Renault Logan',
  'Kia K5',
  'Hyundai Creta',
  'Omoda C5',
];
