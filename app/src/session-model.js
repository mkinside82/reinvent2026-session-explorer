/** Application Session Model. UI never consumes a provider response directly.
 * @typedef {{id:string,code:string,title:string,abstract:string,date:string,endDate:string,startTime:string,endTime:string,sessionType:string,track:string,tracks:string[],topics:string[],level:string,levelLabel:string,venue:string,room:string,speakers:string[],services:string[],industries:string[],roles:string[],keywords:string[],reservable:boolean|null,sourceTime:object|null,uiState:{availability:string,attendance:string}}} Session
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => text(typeof v === 'object' && v ? v.name : v)).filter(Boolean))]
    : [];
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function minutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
const dayMinutes = (value) => {
  if (!validDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 60_000;
};
const absoluteMinutes = (date, time) => {
  const day = dayMinutes(date),
    clock = minutes(time);
  return day === null || clock === null ? null : day + clock;
};
/** Only called by adapters. Missing optional values stay empty, not fabricated. */
export function normalizeSession(record) {
  if (!record || typeof record !== 'object' || !text(record.id)) return null;
  const startTime = text(record.startTime),
    endTime = text(record.endTime);
  const tracks = list(record.tracks);
  if (!tracks.length && text(record.track)) tracks.push(text(record.track));
  const rawLevel = typeof record.level === 'number' ? String(record.level) : text(record.level);
  const level = rawLevel.match(/^\s*(\d+)/)?.[1] || rawLevel;
  const availability = [
    'available',
    'limited',
    'veryLimited',
    'unavailable',
    'walkUp',
    'full',
  ].includes(record.uiState?.availability)
    ? record.uiState.availability
    : 'unknown';
  return {
    id: text(record.id),
    code: text(record.code),
    title: text(record.title) || 'タイトル未定',
    abstract: text(record.abstract),
    date: validDate(text(record.date)) ? text(record.date) : '',
    endDate: validDate(text(record.endDate))
      ? text(record.endDate)
      : validDate(text(record.date))
        ? text(record.date)
        : '',
    startTime: minutes(startTime) !== null ? startTime : '',
    endTime: minutes(endTime) !== null ? endTime : '',
    sessionType: text(record.sessionType),
    track: text(record.track) || tracks[0] || '',
    tracks,
    topics: list(record.topics),
    level,
    levelLabel: text(record.levelLabel) || rawLevel,
    venue: text(record.venue),
    room: text(record.room),
    speakers: list(record.speakers),
    services: list(record.services),
    industries: list(record.industries),
    roles: list(record.roles),
    keywords: list(record.keywords),
    reservable: typeof record.reservable === 'boolean' ? record.reservable : null,
    dataSource: text(record.dataSource) || 'demo',
    itemType: text(record.itemType) || 'session',
    sourceTime:
      record.sourceTime && typeof record.sourceTime === 'object' ? { ...record.sourceTime } : null,
    displayTimeZone: text(record.displayTimeZone),
    sourceUrl: text(record.sourceUrl),
    sourceName: text(record.sourceName),
    verifiedAt: text(record.verifiedAt),
    timingStatus: text(record.timingStatus),
    registrationUrl: text(record.registrationUrl),
    registrationRequired:
      typeof record.registrationRequired === 'boolean' ? record.registrationRequired : null,
    uiState: {
      availability,
      attendance: ['reserved', 'waitlist'].includes(record.uiState?.attendance)
        ? record.uiState.attendance
        : 'none',
      favorite: record.uiState?.favorite === true,
      personalTime: record.uiState?.personalTime === true,
    },
  };
}
export function validInterval(s) {
  const start = absoluteMinutes(s?.date, s?.startTime),
    end = absoluteMinutes(s?.endDate || s?.date, s?.endTime);
  return start !== null && end !== null && end > start;
}
export function intervalBounds(s, referenceDate = s?.date) {
  if (!validInterval(s)) return null;
  const offset = dayMinutes(referenceDate);
  if (offset === null) return null;
  return [
    absoluteMinutes(s.date, s.startTime) - offset,
    absoluteMinutes(s.endDate || s.date, s.endTime) - offset,
  ];
}
export function overlaps(a, b) {
  if (!validInterval(a) || !validInterval(b)) return false;
  return (
    absoluteMinutes(a.date, a.startTime) < absoluteMinutes(b.endDate || b.date, b.endTime) &&
    absoluteMinutes(b.date, b.startTime) < absoluteMinutes(a.endDate || a.date, a.endTime)
  );
}
export function sortSessions(data) {
  return [...data].sort(
    (a, b) =>
      (a.date || '9999').localeCompare(b.date || '9999') ||
      (minutes(a.startTime) ?? 1440) - (minutes(b.startTime) ?? 1440) ||
      a.code.localeCompare(b.code),
  );
}
const searchText = new WeakMap();
const normalized = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase();
const selections = (value) => (Array.isArray(value) ? value : value ? [value] : []);
function matches(s, filters) {
  const query = normalized(filters.query).trim();
  if (!searchText.has(s))
    searchText.set(
      s,
      normalized(
        [
          s.title,
          s.abstract,
          s.code,
          s.track,
          ...s.tracks,
          ...s.topics,
          ...s.speakers,
          ...(s.services || []),
          ...(s.industries || []),
          ...(s.roles || []),
          ...(s.keywords || []),
          ...(s.uiState?.availability === 'walkUp'
            ? ['Walk-up', 'Walk-up Only', 'Walkup', 'Walk up', '当日参加']
            : []),
        ].join(' '),
      ),
    );
  if (query && !searchText.get(s).includes(query)) return false;
  if (filters.walkUpOnly && s.uiState?.availability !== 'walkUp') return false;
  for (const key of ['date', 'track', 'level', 'sessionType']) {
    const values = selections(filters[key]);
    if (values.length && !values.includes(s[key])) return false;
  }
  const locations = selections(filters.venue);
  if (locations.length && !locations.includes(s.venue)) return false;
  const floor = Number(filters.minLevel);
  if (
    Number.isFinite(floor) &&
    floor > 0 &&
    s.itemType !== 'sideEvent' &&
    !/^keynote\b/i.test(s.sessionType || '')
  ) {
    const numericLevel = Number(String(s.level || '').match(/^\s*(\d+)/)?.[1]);
    if (Number.isFinite(numericLevel) && numericLevel > 0) {
      if (numericLevel < floor) return false;
    } else if (!filters.includeUnleveled) return false;
  }
  for (const [key, field] of [
    ['topic', 'topics'],
    ['service', 'services'],
    ['speaker', 'speakers'],
  ]) {
    const values = selections(filters[key]);
    if (values.length && !values.some((value) => (s[field] || []).includes(value))) return false;
  }
  if (filters.from || filters.to) {
    if (!validInterval(s)) return false;
    const from = minutes(filters.from) ?? 0,
      to = minutes(filters.to) ?? 1440;
    if (from >= to) return false;
    const [start, end] = intervalBounds(s);
    if (filters.fit === 'contained') {
      if (start < from || end > to) return false;
    } else if (start >= to || end <= from) return false;
  }
  return true;
}
export function filterSessions(data, filters) {
  return sortSessions(data.filter((s) => matches(s, filters)));
}
/** Sort and normalize the searchable text once. Plan/detail changes reuse results. */
export function createCatalog(data) {
  const chronological = sortSessions(data),
    alphabetical = [...data].sort((a, b) => a.title.localeCompare(b.title));
  for (const s of data) matches(s, {});
  let previousKey, previousResult;
  return {
    search(filters, sort = 'time') {
      const key = JSON.stringify([filters, sort]);
      if (key === previousKey) return previousResult;
      previousKey = key;
      previousResult = (sort === 'title' ? alphabetical : chronological).filter((s) =>
        matches(s, filters),
      );
      return previousResult;
    },
  };
}
/** UI states belong to the application layer, not the AWS response schema. */
export const SESSION_STATES = Object.freeze([
  'Not planned',
  'Planned',
  'Available',
  'Limited',
  'Very limited',
  'Unavailable',
  'Walk-up',
  'Reserved',
  'Favorite',
  'Personal time',
  'Full',
  'Waitlist',
  'Conflict',
]);
export function sessionStates(s, planned, conflicted) {
  const states = [planned ? 'Planned' : 'Not planned'];
  const availability = s.uiState?.availability;
  const labels = {
    available: 'Available',
    limited: 'Limited',
    veryLimited: 'Very limited',
    unavailable: 'Unavailable',
    walkUp: 'Walk-up',
    full: 'Full',
  };
  if (labels[availability]) states.push(labels[availability]);
  if (s.uiState?.favorite) states.push('Favorite');
  if (s.uiState?.personalTime) states.push('Personal time');
  if (s.uiState?.attendance === 'reserved') states.push('Reserved');
  if (s.uiState?.attendance === 'waitlist') states.push('Waitlist');
  if (conflicted) states.push('Conflict');
  return states;
}
/** Merge overlaps before exposing free slots. Meeting end == next start is not a gap. */
export function freeSlots(data, dayStart = 9 * 60, dayEnd = 18 * 60, date) {
  const intervals = data
    .filter(validInterval)
    .map((s) => intervalBounds(s, date || s.date))
    .filter(Boolean)
    .map(([start, end]) => [Math.max(0, dayStart, start), Math.min(1440, dayEnd, end)])
    .filter(([a, b]) => a < b)
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = dayStart;
  for (const [a, b] of intervals) {
    if (a > cursor) gaps.push({ start: cursor, end: a, duration: a - cursor });
    cursor = Math.max(cursor, b);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd, duration: dayEnd - cursor });
  return gaps;
}
export function conflictMap(data) {
  const map = new Map(data.map((s) => [s.id, []]));
  const sorted = sortSessions(data.filter(validInterval)).sort(
    (a, b) => absoluteMinutes(a.date, a.startTime) - absoluteMinutes(b.date, b.startTime),
  );
  for (let i = 0; i < sorted.length; i++)
    for (
      let j = i + 1;
      j < sorted.length &&
      absoluteMinutes(sorted[j].date, sorted[j].startTime) <
        absoluteMinutes(sorted[i].endDate || sorted[i].date, sorted[i].endTime);
      j++
    )
      if (overlaps(sorted[i], sorted[j])) {
        map.get(sorted[i].id).push(sorted[j]);
        map.get(sorted[j].id).push(sorted[i]);
      }
  return map;
}
/** Greedy lanes per connected overlap group; adjacent sessions share one lane. */
export function timelineLayout(data, date = data.find(validInterval)?.date) {
  const sorted = data
      .filter(validInterval)
      .map((session) => {
        const [start, end] = intervalBounds(session, date);
        return { session, start: Math.max(0, start), end: Math.min(1440, end) };
      })
      .filter(({ start, end }) => start < end)
      .sort((a, b) => a.start - b.start),
    groups = [];
  for (const item of sorted) {
    let g = groups.at(-1);
    if (!g || item.start >= g.end) {
      g = { end: item.end, sessions: [] };
      groups.push(g);
    }
    g.end = Math.max(g.end, item.end);
    g.sessions.push(item);
  }
  return groups.flatMap((g) => {
    const ends = [],
      placed = [];
    for (const item of g.sessions) {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = item.end;
      placed.push({ ...item, lane });
    }
    return placed.map((p) => ({ ...p, lanes: ends.length }));
  });
}
