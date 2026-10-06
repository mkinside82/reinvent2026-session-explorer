/** Application Session Model. UI never consumes a provider response directly.
 * @typedef {{id:string,code:string,title:string,abstract:string,date:string,startTime:string,endTime:string,sessionType:string,track:string,tracks:string[],topics:string[],level:string,levelLabel:string,venue:string,room:string,speakers:string[],services:string[],industries:string[],roles:string[],keywords:string[],reservable:boolean|null,sourceTime:object|null,uiState:{availability:string,attendance:string}}} Session
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
  return (
    !!s.date &&
    minutes(s.startTime) !== null &&
    minutes(s.endTime) !== null &&
    minutes(s.endTime) > minutes(s.startTime)
  );
}
export function overlaps(a, b) {
  return (
    a.date === b.date &&
    validInterval(a) &&
    validInterval(b) &&
    minutes(a.startTime) < minutes(b.endTime) &&
    minutes(b.startTime) < minutes(a.endTime)
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
        ].join(' '),
      ),
    );
  if (query && !searchText.get(s).includes(query)) return false;
  for (const key of ['date', 'track', 'level', 'sessionType', 'venue']) {
    const values = selections(filters[key]);
    if (values.length && !values.includes(s[key])) return false;
  }
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
    if (filters.fit === 'contained') {
      if (minutes(s.startTime) < from || minutes(s.endTime) > to) return false;
    } else if (minutes(s.startTime) >= to || minutes(s.endTime) <= from) return false;
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
export function freeSlots(data, dayStart = 9 * 60, dayEnd = 18 * 60) {
  const intervals = data
    .filter(validInterval)
    .map((s) => [Math.max(dayStart, minutes(s.startTime)), Math.min(dayEnd, minutes(s.endTime))])
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
  const grouped = new Map();
  for (const s of data.filter(validInterval)) {
    if (!grouped.has(s.date)) grouped.set(s.date, []);
    grouped.get(s.date).push(s);
  }
  for (const group of grouped.values()) {
    const sorted = sortSessions(group);
    for (let i = 0; i < sorted.length; i++)
      for (
        let j = i + 1;
        j < sorted.length && minutes(sorted[j].startTime) < minutes(sorted[i].endTime);
        j++
      )
        if (overlaps(sorted[i], sorted[j])) {
          map.get(sorted[i].id).push(sorted[j]);
          map.get(sorted[j].id).push(sorted[i]);
        }
  }
  return map;
}
/** Greedy lanes per connected overlap group; adjacent sessions share one lane. */
export function timelineLayout(data) {
  const sorted = sortSessions(data.filter(validInterval)),
    groups = [];
  for (const s of sorted) {
    let g = groups.at(-1);
    if (!g || minutes(s.startTime) >= g.end) {
      g = { end: minutes(s.endTime), sessions: [] };
      groups.push(g);
    }
    g.end = Math.max(g.end, minutes(s.endTime));
    g.sessions.push(s);
  }
  return groups.flatMap((g) => {
    const ends = [],
      placed = [];
    for (const s of g.sessions) {
      let lane = ends.findIndex((end) => end <= minutes(s.startTime));
      if (lane < 0) lane = ends.length;
      ends[lane] = minutes(s.endTime);
      placed.push({ session: s, lane });
    }
    return placed.map((p) => ({ ...p, lanes: ends.length }));
  });
}
