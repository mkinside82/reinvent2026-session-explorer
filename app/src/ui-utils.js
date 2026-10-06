import { t, getLocale } from './i18n.js';
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
export const timeLabel = (s) =>
  s.startTime || s.endTime
    ? `${s.startTime || t('未定')}–${s.endTime || t('未定')}`
    : t('時間未定');
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
