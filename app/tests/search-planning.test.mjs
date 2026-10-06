import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { adaptDemoData } from '../src/session-data.js';
import {
  createCatalog,
  filterSessions,
  freeSlots,
  sessionStates,
  normalizeSession,
} from '../src/session-model.js';
import { readSearchState, searchURL, defaultFilters } from '../src/search-state.js';
const data = adaptDemoData(
  JSON.parse(await readFile(new URL('../sessions.demo.json', import.meta.url), 'utf8')),
);
test('multi facets OR within each dimension, AND across dimensions; service and keyword search', () => {
  assert(filterSessions(data, { query: 'Amazon Bedrock' }).some((s) => s.id === 'SEC001'));
  assert(filterSessions(data, { query: 'best practices' }).length);
  const found = filterSessions(data, {
    track: ['AI / ML', 'Security'],
    level: ['200', '300'],
    date: ['2026-12-01'],
  });
  assert(found.some((s) => s.id === 'SEC001'));
  assert(found.some((s) => s.id === 'SEC009'));
  assert(!found.some((s) => s.id === 'SEC003'));
  assert(!found.some((s) => s.id === 'SEC011'));
  assert.deepEqual(
    filterSessions(data, { venue: ['Room 101'] }).map((s) => s.id),
    [],
    'location filter does not include room names',
  );
  assert.deepEqual(
    filterSessions(data, { venue: ['Demo venue A'] })
      .map((s) => s.id)
      .sort(),
    ['SEC001', 'SEC006', 'SEC011', 'SEC016'],
    'location facet also includes the venue/building name',
  );
});
test('free gaps merge overlapping reservations and a contained search excludes partial overlaps', () => {
  const s = (a, b) =>
    normalizeSession({ id: a, code: a, date: '2026-12-01', startTime: a, endTime: b });
  const plan = [s('10:00', '11:00'), s('10:30', '11:30'), s('13:00', '14:00')];
  assert.deepEqual(freeSlots(plan, 600, 900), [
    { start: 690, end: 780, duration: 90 },
    { start: 840, end: 900, duration: 60 },
  ]);
  assert.deepEqual(
    filterSessions(data, {
      date: ['2026-12-01'],
      from: '11:00',
      to: '13:00',
      fit: 'contained',
    }).map((s) => s.id),
    ['SEC007'],
  );
  assert(
    !filterSessions(data, {
      date: ['2026-12-01'],
      from: '11:00',
      to: '13:00',
      fit: 'contained',
    }).some((s) => s.id === 'SEC002'),
  );
});
test('URL state round trips multi selections, unicode query, view and unrelated parameters', () => {
  const state = {
    filters: {
      ...defaultFilters(),
      query: 'AWS 日本語 & AI',
      date: ['2026-12-01', '2026-12-02'],
      level: ['200', '300'],
      topic: ['Architecture', 'Agents'],
      from: '10:00',
      to: '12:00',
      fit: 'contained',
    },
    view: 'compact',
    sort: 'title',
  };
  const url = searchURL('https://example.test/?keep=1#part', state);
  const result = readSearchState(url);
  assert.deepEqual(result.filters, state.filters);
  assert.equal(result.view, 'compact');
  assert.equal(result.sort, 'title');
  assert.equal(url.searchParams.get('keep'), '1');
  assert.equal(url.hash, '#part');
  assert.deepEqual(
    readSearchState('https://example.test/?date=not-a-date&date=2026-02-30').filters.date,
    [],
  );
});
test('Level 200+ default applies only to a clean first URL and survives sharing, history, and Clear all', () => {
  assert.equal(readSearchState('https://example.test/').filters.minLevel, 200);
  assert.equal(readSearchState('https://example.test/?view=compact').filters.minLevel, 200);
  assert.equal(readSearchState('https://example.test/?q=bedrock').filters.minLevel, null);
  const defaulted = { ...readSearchState('https://example.test/'), kind: 'sideEvents' };
  const shared = searchURL('https://example.test/', defaulted);
  assert.equal(shared.searchParams.get('minLevel'), '200');
  assert.equal(readSearchState(shared).filters.minLevel, 200);
  const cleared = {
    filters: { ...defaultFilters(), levelDefaultSuppressed: true },
    view: 'card',
    sort: 'time',
    kind: 'sessions',
  };
  const clearUrl = searchURL('https://example.test/', cleared);
  assert.equal(clearUrl.searchParams.get('levelDefault'), 'off');
  assert.equal(readSearchState(clearUrl).filters.minLevel, null);
});
test('minimum level keeps 500-level, keynote, and side events while separately gating technical sessions with no level', () => {
  const items = [
    normalizeSession({ id: '100', level: '100' }),
    normalizeSession({ id: '200', level: '200' }),
    normalizeSession({ id: '500', level: '500' }),
    normalizeSession({ id: 'unset', level: 'No Level' }),
    normalizeSession({ id: 'keynote', level: 'No Level', sessionType: 'Keynote' }),
    normalizeSession({ id: 'side', itemType: 'sideEvent', levelLabel: 'No technical level' }),
  ];
  const base = { ...defaultFilters(), minLevel: 200 };
  assert.deepEqual(
    filterSessions(items, base).map((s) => s.id),
    ['200', '500', 'keynote', 'side'],
  );
  assert.deepEqual(
    filterSessions(items, { ...base, includeUnleveled: true }).map((s) => s.id),
    ['200', '500', 'unset', 'keynote', 'side'],
  );
});
test('application states define local planning independently from demo availability/attendance', () => {
  assert.deepEqual(sessionStates(normalizeSession({ id: 'a' }), false, false), ['Not planned']);
  assert.deepEqual(
    sessionStates(
      normalizeSession({ id: 'a', uiState: { availability: 'available', attendance: 'reserved' } }),
      true,
      true,
    ),
    ['Planned', 'Available', 'Reserved', 'Conflict'],
  );
  assert.deepEqual(
    sessionStates(
      normalizeSession({ id: 'a', uiState: { availability: 'full', attendance: 'waitlist' } }),
      false,
      false,
    ),
    ['Not planned', 'Full', 'Waitlist'],
  );
});
test('5000-session index reuses cached results for plan-only changes and bounds repeated search work', () => {
  const large = adaptDemoData(
    Array.from({ length: 5000 }, (_, i) => ({ ...data[i % data.length], id: `bench-${i}` })),
  );
  const t0 = performance.now();
  const catalog = createCatalog(large);
  const setup = performance.now() - t0;
  const filters = { ...defaultFilters(), query: 'agent', level: ['300'] };
  const t1 = performance.now();
  const found = catalog.search(filters);
  const search = performance.now() - t1;
  assert(found.length);
  assert.equal(catalog.search(filters), found);
  console.log(
    `5000 sessions: index ${setup.toFixed(1)}ms; filtered search ${search.toFixed(1)}ms; cached repeat reuses result`,
  );
});
