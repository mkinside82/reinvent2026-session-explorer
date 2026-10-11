import { normalizeSession } from './session-model.js';
import {
  VENUE_TIME_ZONE,
  convertWallClock,
  dateTimePartsInZone,
  isValidTimeZone,
  localDateTimeEpoch,
  venueLocalDateTimeToUtc,
  venueLocalTimestampParts,
} from './time-zones.js';

export { venueLocalDateTimeToUtc };
/** Demo-provider adapter. Legacy start/end/type fields are mapped only here.
 * Phase 2: implement a server-backed provider returning Application Sessions.
 * AWS response mapping, pagination and tokens must live behind that boundary.
 */
export function adaptDemoData(raw) {
  if (!Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
  const seen = new Set();
  return raw
    .map((row) =>
      normalizeSession({
        ...row,
        startTime: row?.startTime ?? row?.start,
        endTime: row?.endTime ?? row?.end,
        sessionType: row?.sessionType ?? row?.type,
        dataSource: 'demo',
        displayTimeZone: VENUE_TIME_ZONE,
      }),
    )
    .filter((s) => {
      if (!s || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
}
const list = (value) => (Array.isArray(value) ? value : []);
function sessionEnd(start, length) {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(start || '') ||
    !/^[1-9]\d{0,3}$/.test(String(length ?? ''))
  )
    return '';
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + Number(length);
  if (total <= 0 || total > 24 * 60) return '';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function venueLocalTime(time) {
  const date = typeof time.date === 'string' ? time.date : '',
    start = typeof time.time === 'string' ? time.time : '',
    length = typeof time.length === 'string' ? time.length : '';
  const timezone = typeof time.timezone === 'string' ? time.timezone : '';
  const original = { date, time: start, length, timezone };
  const sourceZoneAvailable = isValidTimeZone(timezone),
    sourceZone = sourceZoneAvailable ? timezone : VENUE_TIME_ZONE,
    startEpoch = localDateTimeEpoch(date, start, sourceZone);
  if (startEpoch === null)
    return {
      date,
      startTime: start,
      endTime: sessionEnd(start, length),
      sourceTime: original,
      displayTimeZone: VENUE_TIME_ZONE,
      timezoneAssumed: true,
    };
  const localStart = dateTimePartsInZone(startEpoch, VENUE_TIME_ZONE),
    endEpoch = /^[1-9]\d{0,3}$/.test(length) ? startEpoch + Number(length) * 60000 : null,
    localEnd = endEpoch === null ? null : dateTimePartsInZone(endEpoch, VENUE_TIME_ZONE);
  return {
    date: localStart.date,
    endDate: localEnd?.date || localStart.date,
    startTime: localStart.time,
    endTime: localEnd?.time || '',
    sourceTime: original,
    displayTimeZone: VENUE_TIME_ZONE,
    timezoneAssumed: !sourceZoneAvailable,
  };
}
/** Maps only fields defined by the AWS Events OpenAPI Session schema. */
export function normalizeAwsSession(row) {
  if (!row || typeof row !== 'object' || typeof row.sessionId !== 'string' || !row.sessionId.trim())
    return null;
  const time = row.sessionTime && typeof row.sessionTime === 'object' ? row.sessionTime : {};
  const local = venueLocalTime(time);
  const level = typeof row.level === 'string' ? row.level : '';
  const availability =
    {
      available: 'available',
      limited: 'limited',
      veryLimited: 'veryLimited',
      unavailable: 'unavailable',
      walkUp: 'walkUp',
    }[row.seatAvailability] || 'unknown';
  const speakers = list(row.speakers)
    .map((s) => (typeof s === 'string' ? s : s?.name))
    .filter((v) => typeof v === 'string');
  const venue = typeof row.venue === 'string' ? row.venue.trim() : '';
  const room = typeof row.room === 'string' ? row.room.trim() : '';
  const [firstLocationPart, ...remainingLocationParts] = room.split(/\s*\|\s*/);
  const location =
    !venue && remainingLocationParts.length
      ? { venue: firstLocationPart, room: remainingLocationParts.join(' | ') }
      : { venue, room };
  return normalizeSession({
    id: row.sessionId,
    code: row.abbreviation,
    title: row.title,
    abstract: row.abstract,
    date: local.date,
    startTime: local.startTime,
    endTime: local.endTime,
    endDate: local.endDate,
    sessionType: row.type,
    level,
    levelLabel: level,
    track: list(row.tracks)[0] || '',
    tracks: row.tracks,
    topics: [...list(row.topics), ...list(row.areasOfInterest)],
    industries: row.industries,
    roles: [...list(row.roles), ...list(row.customerPersonas)],
    services: row.services,
    speakers,
    venue: location.venue,
    room: location.room,
    keywords: [
      ...list(row.segments),
      ...list(row.features),
      ...list(row.experiences),
      ...list(row.additionalActivities),
      ...list(row.focusAreas),
    ],
    reservable: typeof row.isReservable === 'boolean' ? row.isReservable : null,
    dataSource: 'aws',
    sourceTime: local.sourceTime,
    displayTimeZone: local.displayTimeZone,
    timezoneAssumed: local.timezoneAssumed,
    uiState: { availability, attendance: 'none' },
  });
}
export function adaptAwsSessions(raw) {
  if (!Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
  const seen = new Set();
  return raw.map(normalizeAwsSession).filter((s) => {
    if (!s || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}
/** Maps AWS Schedule personal-time wall-clock blocks into the canonical venue-time model. */
export function adaptAwsPersonalTimes(raw) {
  if (!Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
  const seen = new Set();
  return raw
    .map((row) => {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof row.personalTimeId !== 'string' ||
        !row.personalTimeId.trim()
      )
        return null;
      const start = row.startDateTime,
        end = row.endDateTime,
        localStart = venueLocalTimestampParts(start),
        localEnd = venueLocalTimestampParts(end);
      if (!localStart || !localEnd || localEnd.epoch <= localStart.epoch) return null;
      const id = `aws-personal:${row.personalTimeId}`;
      if (seen.has(id)) return null;
      seen.add(id);
      const item = normalizeSession({
        id,
        code: 'PERSONAL',
        title: typeof row.title === 'string' ? row.title : 'Personal time',
        abstract: typeof row.description === 'string' ? row.description : '',
        date: localStart.date,
        startTime: localStart.time,
        endDate: localEnd.date,
        endTime: localEnd.time,
        sessionType: 'Personal time',
        venue: typeof row.location === 'string' ? row.location : '',
        displayTimeZone: VENUE_TIME_ZONE,
        dataSource: 'aws-personal-time',
        itemType: 'personalTime',
        uiState: { personalTime: true },
      });
      return item
        ? {
            ...item,
            personalTimeId: row.personalTimeId,
            sourceStartDateTime: start,
            sourceEndDateTime: end,
          }
        : null;
    })
    .filter(Boolean);
}
export function normalizeSideEvent(row) {
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.sourceUrl !== 'string' ||
    !row.sourceUrl.startsWith('https://')
  )
    return null;
  if (
    row.timingStatus &&
    !['confirmed', 'tentative', 'listed', 'unknown'].includes(row.timingStatus)
  )
    return null;
  const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '',
    sourceTimeZone = typeof row.timezone === 'string' ? row.timezone : '',
    sourceZoneAvailable = isValidTimeZone(sourceTimeZone),
    sourceZone = sourceZoneAvailable ? sourceTimeZone : VENUE_TIME_ZONE,
    startTime = typeof row.startTime === 'string' ? row.startTime : '',
    endTime = typeof row.endTime === 'string' ? row.endTime : '';
  let endDate = typeof row.endDate === 'string' ? row.endDate : date;
  if (!row.endDate && startTime && endTime && endTime < startTime && date) {
    const nextDate = new Date(`${date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    endDate = nextDate.toISOString().slice(0, 10);
  }
  const convertedStart = startTime ? convertWallClock(date, startTime, sourceZone) : null,
    convertedEnd = endTime ? convertWallClock(endDate, endTime, sourceZone) : null,
    normalizedDate = convertedStart?.date || date,
    normalizedEndDate = convertedEnd?.date || endDate,
    normalizedStartTime = convertedStart?.time || startTime,
    normalizedEndTime = convertedEnd?.time || endTime;
  const item = normalizeSession({
    id: `side:${row.id}`,
    title: row.title,
    abstract: row.description,
    code: 'EVENT',
    date: normalizedDate,
    endDate: normalizedEndDate,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    sessionType: 'Side event',
    level: '',
    levelLabel: 'No technical level',
    venue: row.venue || '',
    room: row.room || '',
    displayTimeZone: VENUE_TIME_ZONE,
    timezoneAssumed: !sourceZoneAvailable || !!convertedStart?.assumed || !!convertedEnd?.assumed,
    topics: [row.category, ...(Array.isArray(row.tags) ? row.tags : [])]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
      .filter((value, index, values) => values.indexOf(value) === index),
    uiState: row.uiState,
    dataSource: 'curated-side-event',
    itemType: 'sideEvent',
  });
  if (!item) return null;
  return {
    ...item,
    category: typeof row.category === 'string' ? row.category : '',
    startsAt: typeof row.startsAt === 'string' ? row.startsAt : '',
    endsAt: typeof row.endsAt === 'string' ? row.endsAt : '',
    timezone: sourceTimeZone,
    sourceUrl: row.sourceUrl,
    sourceName: typeof row.sourceName === 'string' ? row.sourceName : '',
    listingUrl: typeof row.listingUrl === 'string' ? row.listingUrl : '',
    verifiedAt: typeof row.verifiedAt === 'string' ? row.verifiedAt : '',
    sponsor: typeof row.sponsor === 'string' ? row.sponsor : '',
    registrationUrl: typeof row.registrationUrl === 'string' ? row.registrationUrl : '',
    registrationRequired:
      typeof row.registrationRequired === 'boolean' ? row.registrationRequired : null,
    timingStatus: row.timingStatus || 'unknown',
  };
}
export function adaptSideEvents(raw) {
  if (!Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
  const seen = new Set();
  return raw.map(normalizeSideEvent).filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
export const demoProvider = {
  async listSessions({ signal } = {}) {
    const response = await fetch('./sessions.demo.json', { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('FETCH_FAILED');
    return adaptDemoData(await response.json());
  },
};
export function createSessionRepository(provider) {
  if (typeof provider?.listSessions !== 'function') throw new Error('Invalid session provider');
  return { listSessions: (options) => provider.listSessions(options) };
}
export const sessionRepository = createSessionRepository(demoProvider);
export const sideEventRepository = {
  async listSideEvents({ signal } = {}) {
    const response = await fetch('./side-events.verified.json', { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('SIDE_EVENT_FETCH_FAILED');
    return adaptSideEvents(await response.json());
  },
};

let csrfToken = '';
async function apiRequest(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof result.error === 'string' ? result.error : 'LOCAL_API_ERROR');
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function localSessionStatus() {
  const result = await apiRequest('/api/session');
  if (typeof result.csrf !== 'string' || typeof result.authenticated !== 'boolean')
    throw new Error('LOCAL_API_UNAVAILABLE');
  csrfToken = result.csrf;
  return result;
}
export async function startBuilderIdSignIn() {
  const result = await apiRequest('/api/auth/start', { method: 'POST', body: {} });
  if (typeof result.authorizationUrl !== 'string') throw new Error('LOCAL_API_ERROR');
  return result.authorizationUrl;
}
export async function signOutAws() {
  return apiRequest('/api/auth/logout', { method: 'POST', body: {} });
}
export async function signOutBuilderId() {
  const result = await apiRequest('/api/auth/logout-builder-id', { method: 'POST', body: {} });
  return result.logoutUrl;
}
export async function requestCatalogRefresh() {
  return apiRequest('/api/live/catalog/refresh', { method: 'POST', body: {} });
}
export async function fetchLiveCatalog({ signal } = {}) {
  const snapshot = await apiRequest('/api/live/catalog', { signal });
  return { ...snapshot, sessions: adaptAwsSessions(snapshot.items) };
}
export async function fetchLiveSchedule() {
  return apiRequest('/api/live/schedule');
}
export async function fetchRecommendationNews() {
  return apiRequest('/api/live/recommendation-news');
}
export async function reserveLiveSessions(sessionIds) {
  return apiRequest('/api/live/reservations', { method: 'POST', body: { sessionIds } });
}
export async function associateLiveFavorites(sessionIds) {
  return apiRequest('/api/live/favorites', { method: 'POST', body: { sessionIds } });
}
export async function removeLiveFavorites(sessionIds) {
  return apiRequest('/api/live/favorites/remove', { method: 'POST', body: { sessionIds } });
}
export async function cancelLiveReservations(sessionIds) {
  return apiRequest('/api/live/reservations/cancel', { method: 'POST', body: { sessionIds } });
}
export async function saveLivePersonalTime(input) {
  return apiRequest('/api/live/personal-time', { method: 'POST', body: input });
}
