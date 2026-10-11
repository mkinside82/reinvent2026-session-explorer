const formatterCache = new Map();
const validTimeZoneCache = new Map();

export const VENUE_TIME_ZONE = 'America/Los_Angeles';
export const JAPAN_TIME_ZONE = 'Asia/Tokyo';

export function zonedParts(epoch, timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return Object.fromEntries(
    formatter
      .formatToParts(epoch)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  if (validTimeZoneCache.has(timeZone)) return validTimeZoneCache.get(timeZone);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    validTimeZoneCache.set(timeZone, true);
    return true;
  } catch {
    validTimeZoneCache.set(timeZone, false);
    return false;
  }
}

export function dateTimePartsInZone(epoch, timeZone) {
  if (!Number.isFinite(epoch) || !isValidTimeZone(timeZone)) return null;
  const parts = zonedParts(epoch, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** Convert a timezone-local wall-clock time into an epoch timestamp. */
export function localDateTimeEpoch(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))
    return null;
  const [year, month, day] = date.split('-').map(Number),
    [hour, minute] = time.split(':').map(Number),
    target = Date.UTC(year, month - 1, day, hour, minute);
  let epoch = target;
  try {
    for (let i = 0; i < 5; i++) {
      const values = zonedParts(epoch, timeZone),
        represented = Date.UTC(
          Number(values.year),
          Number(values.month) - 1,
          Number(values.day),
          Number(values.hour),
          Number(values.minute),
        ),
        delta = target - represented;
      if (!delta) break;
      epoch += delta;
    }
    const values = zonedParts(epoch, timeZone);
    if (
      Number(values.year) !== year ||
      Number(values.month) !== month ||
      Number(values.day) !== day ||
      Number(values.hour) !== hour ||
      Number(values.minute) !== minute
    )
      return null;
    return epoch;
  } catch {
    return null;
  }
}

/** Convert a wall-clock value from its source zone into a canonical display zone. */
export function convertWallClock(date, time, sourceTimeZone, displayTimeZone = VENUE_TIME_ZONE) {
  if (!isValidTimeZone(sourceTimeZone)) return { date, time, assumed: true };
  const epoch = localDateTimeEpoch(date, time, sourceTimeZone),
    converted = epoch === null ? null : dateTimePartsInZone(epoch, displayTimeZone);
  return converted ? { ...converted, epoch, assumed: false } : { date, time, assumed: true };
}

/** Convert an ISO UTC timestamp into a local date/time pair for a target zone. */
export function utcTimestampInZone(value, timeZone = VENUE_TIME_ZONE) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value) ||
    Number.isNaN(Date.parse(`${value}Z`))
  )
    return null;
  return dateTimePartsInZone(Date.parse(`${value}Z`), timeZone);
}

/** AWS Schedule personal-time values are venue-local wall-clock strings. */
export function venueLocalTimestampParts(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d):00$/.exec(value);
  if (!match) return null;
  const epoch = localDateTimeEpoch(match[1], match[2], VENUE_TIME_ZONE);
  return epoch === null ? null : { date: match[1], time: match[2], epoch };
}

export function venueLocalDateTimeToUtc(date, time) {
  const epoch = localDateTimeEpoch(date, time, VENUE_TIME_ZONE);
  return epoch === null ? null : new Date(epoch).toISOString().slice(0, 19);
}
