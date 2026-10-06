const TZ = 'America/Los_Angeles';
const textEncoder = new TextEncoder();
const escaped = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
export function calendarInstant(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))
    return null;
  const [year, month, day] = date.split('-').map(Number),
    [hour, minute] = time.split(':').map(Number),
    target = Date.UTC(year, month - 1, day, hour, minute);
  let epoch = target;
  try {
    for (let i = 0; i < 5; i++) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(epoch);
      const p = Object.fromEntries(
        parts.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
      );
      const represented = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
      );
      const delta = target - represented;
      if (!delta) break;
      epoch += delta;
    }
    const back = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(epoch);
    const p = Object.fromEntries(
      back.filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
    );
    if (
      Number(p.year) !== year ||
      Number(p.month) !== month ||
      Number(p.day) !== day ||
      Number(p.hour) !== hour ||
      Number(p.minute) !== minute
    )
      return null;
    return new Date(epoch).toISOString();
  } catch {
    return null;
  }
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
    item.abstract,
    item.code ? `Session: ${item.code}` : '',
    `Venue local time zone: ${TZ}`,
  ]
    .filter(Boolean)
    .join('\n');
  const location = [item.venue, item.room].filter(Boolean).join(' · ');
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escaped(item.title)}`,
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
