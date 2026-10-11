import { localDateTimeEpoch, VENUE_TIME_ZONE } from './time-zones.js';

const textEncoder = new TextEncoder();
const escaped = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
export function calendarInstant(date, time) {
  const epoch = localDateTimeEpoch(date, time, VENUE_TIME_ZONE);
  return epoch === null ? null : new Date(epoch).toISOString();
}
function utcStamp(date, time) {
  const value = calendarInstant(date, time);
  return value ? value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : null;
}
function foldLine(line) {
  let output = '',
    part = '',
    bytes = 0;
  for (const char of line) {
    const size = textEncoder.encode(char).length,
      limit = output ? 74 : 75;
    if (bytes + size > limit) {
      output += (output ? '\r\n ' : '') + part;
      part = char;
      bytes = size;
    } else {
      part += char;
      bytes += size;
    }
  }
  return output + (output ? '\r\n ' : '') + part;
}
function utcStampNow(now) {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}
function eventFor(item, stamp) {
  const start = utcStamp(item.date, item.startTime),
    end = utcStamp(item.endDate || item.date, item.endTime);
  if (!start || !end || end <= start) return null;
  const uid = `${encodeURIComponent(item.id).replace(/%/g, '_')}@reinvent-session-explorer`;
  const description = [
    item.calendarStatusLine,
    item.calendarAvailability,
    item.abstract,
    item.code ? `Session: ${item.code}` : '',
    `Venue local time zone: ${VENUE_TIME_ZONE}`,
  ]
    .filter(Boolean)
    .join('\n');
  const location = [item.venue, item.room].filter(Boolean).join(' · ');
  const summaryPrefix = [item.calendarAvailability, item.calendarStatus]
    .filter(Boolean)
    .join(' · ');
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escaped(summaryPrefix ? `[${summaryPrefix}] ${item.title}` : item.title)}`,
    ...(description ? [`DESCRIPTION:${escaped(description)}`] : []),
    ...(location ? [`LOCATION:${escaped(location)}`] : []),
    'END:VEVENT',
  ];
}
export function createCalendarIcs(items, { name = 'AWS re:Invent 2026', now = new Date() } = {}) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new TypeError('now must be a valid Date');
  const stamp = utcStampNow(now),
    events = items.map((item) => eventFor(item, stamp)).filter(Boolean);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//reInvent Session Explorer//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escaped(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return {
    content: lines.map(foldLine).join('\r\n') + '\r\n',
    exported: events.length,
    skipped: items.length - events.length,
  };
}
