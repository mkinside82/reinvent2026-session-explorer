import { t, getLocale } from './i18n.js';
import {
  JAPAN_TIME_ZONE,
  VENUE_TIME_ZONE,
  dateTimePartsInZone,
  localDateTimeEpoch,
} from './time-zones.js';
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const dateLabel = (date) =>
  date
    ? new Intl.DateTimeFormat(getLocale(), {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        timeZone: 'UTC',
      }).format(new Date(`${date}T12:00:00Z`))
    : t('日付未定');
export const timeLabel = (s, referenceDate = s.date) => {
  if (!s.startTime && !s.endTime) return t('時間未定');
  const start =
    s.date && referenceDate > s.date
      ? `${t('前日')}${s.startTime || t('未定')}`
      : s.startTime || t('未定');
  const end =
    s.endDate && referenceDate < s.endDate
      ? `${t('翌')}${s.endTime || t('未定')}`
      : s.endTime || t('未定');
  return `${start}–${end}`;
};
export const japanTimeLabel = (s) => {
  const timeZone = s.displayTimeZone || VENUE_TIME_ZONE;
  if (timeZone === 'timezone-unavailable' || !s.date || !s.startTime) return '';
  const start = localDateTimeEpoch(s.date, s.startTime, timeZone);
  if (start === null) return '';
  const format = (epoch) => {
    const parts = dateTimePartsInZone(epoch, JAPAN_TIME_ZONE);
    return parts && { date: parts.date, label: `${dateLabel(parts.date)} ${parts.time}` };
  };
  const startParts = format(start);
  if (!startParts) return '';
  if (!s.endTime) return `${t('日本時間')} ${startParts.label}`;
  const end = localDateTimeEpoch(s.endDate || s.date, s.endTime, timeZone);
  if (end === null) return '';
  const endParts = format(end),
    endLabel =
      endParts.date === startParts.date ? endParts.label.split(' ').at(-1) : endParts.label;
  return `${t('日本時間')} ${startParts.label}–${endLabel}`;
};
export const place = (s) => [s.venue, s.room].filter(Boolean).join(' / ') || t('会場未定');
export const venueToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const clock = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const blank = (title, message, action = '') =>
  `<div class="state-box"><h3>${title}</h3><p>${message}</p>${action}</div>`;
