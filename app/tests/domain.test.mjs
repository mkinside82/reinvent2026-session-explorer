import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  adaptAwsSessions,
  adaptSideEvents,
  adaptDemoData,
  createSessionRepository,
} from '../src/session-data.js';
import {
  normalizeSession,
  filterSessions,
  overlaps,
  conflictMap,
  timelineLayout,
  validDate,
} from '../src/session-model.js';
import { readPlan, writePlan } from '../src/plan-store.js';
const data = adaptDemoData(
  JSON.parse(await readFile(new URL('../sessions.demo.json', import.meta.url), 'utf8')),
);
test('legacy fixture maps to application model and preserves original plan IDs', () => {
  assert.equal(data.length, 18);
  assert.equal(data[0].startTime, '10:00');
  assert.equal(data[0].sessionType, 'Breakout session');
  assert.deepEqual(
    data.slice(0, 5).map((s) => s.id),
    ['SEC001', 'SEC002', 'SEC003', 'SEC004', 'SEC005'],
  );
});
test('search spans all requested fields and combines all filters', () => {
  for (const query of ['AIM301', 'Demo Speaker A', 'Observability', 'AI / ML', 'production-grade'])
    assert(filterSessions(data, { query }).some((s) => s.id === 'SEC001'));
  assert.deepEqual(
    filterSessions(data, {
      query: 'agent',
      date: '2026-12-01',
      from: '10:15',
      to: '10:45',
      track: 'AI / ML',
      topic: 'Agents',
      level: '300',
      sessionType: 'Breakout session',
    }).map((s) => s.id),
    ['SEC001'],
  );
  assert.equal(filterSessions(data, { query: 'not-a-real-session' }).length, 0);
  assert.equal(
    filterSessions(data, { from: '16:00', to: '17:00' }).some((s) => s.id === 'SEC008'),
    false,
  );
});
test('optional fields, malformed response and duplicate IDs are defensive', () => {
  const optional = normalizeSession({ id: 'missing' });
  assert.equal(optional.title, 'タイトル未定');
  assert.deepEqual(optional.speakers, []);
  assert.equal(optional.startTime, '');
  assert.equal(normalizeSession({ title: 'no id' }), null);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(normalizeSession({ id: 'badtime', startTime: '26:00' }).startTime, '');
  assert.equal(adaptDemoData([{ id: 'a' }, { id: 'a' }, null]).length, 1);
  assert.throws(() => adaptDemoData({ sessions: [] }));
});
test('conflicts include only strict overlap on the same date', () => {
  const a = { id: 'a', code: 'A', date: '2026-12-01', startTime: '10:00', endTime: '11:00' },
    b = { ...a, id: 'b', startTime: '10:30', endTime: '12:00' },
    c = { ...a, id: 'c', startTime: '11:00', endTime: '12:00' };
  assert(overlaps(a, b));
  assert(!overlaps(a, c));
  assert(!overlaps(a, { ...b, date: '2026-12-02' }));
  assert(!overlaps(a, { ...b, endTime: '' }));
  const map = conflictMap([a, b, c]);
  assert.deepEqual(
    map.get('a').map((s) => s.id),
    ['b'],
  );
  assert.deepEqual(
    map.get('b').map((s) => s.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    map.get('c').map((s) => s.id),
    ['b'],
  );
});
test('timeline lanes keep conflicting events separate and collapse later groups', () => {
  const sessions = [
    ['a', '10:00', '11:00'],
    ['b', '10:15', '11:30'],
    ['c', '10:30', '12:00'],
    ['d', '12:00', '13:00'],
  ].map(([id, startTime, endTime]) => ({ id, code: id, date: '2026-12-01', startTime, endTime }));
  const layout = timelineLayout(sessions);
  assert.deepEqual(
    layout.map((s) => [s.lane, s.lanes]),
    [
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 1],
    ],
  );
});
test('legacy storage survives; corrupted and blocked storage never crash', () => {
  assert.deepEqual(readPlan({ getItem: () => JSON.stringify(['SEC001', 'SEC001', null]) }).ids, [
    'SEC001',
  ]);
  assert(readPlan({ getItem: () => '{broken' }).warning);
  assert(
    readPlan({
      getItem: () => {
        throw Error('blocked');
      },
    }).warning,
  );
  assert(
    writePlan(
      {
        setItem: () => {
          throw Error('quota');
        },
      },
      ['SEC001'],
    ),
  );
});
test('repository isolates UI from provider and carries cancellation', async () => {
  const controller = new AbortController();
  let passed;
  const repo = createSessionRepository({
    listSessions: async (o) => {
      passed = o.signal;
      return data;
    },
  });
  assert.equal((await repo.listSessions({ signal: controller.signal })).length, 18);
  assert.equal(passed, controller.signal);
});
test('AWS OpenAPI session fields map through the adapter without inventing missing values', () => {
  const raw = {
    sessionId: 'aws-1',
    title: 'Cloud architecture',
    abbreviation: 'ARC3001',
    abstract: 'Build resilient systems',
    type: 'Breakout session',
    level: '300 - Advanced',
    sessionTime: { date: '2026-12-01', time: '18:15', length: '45', timezone: 'UTC' },
    speakers: [{ name: 'AWS Speaker' }],
    tracks: ['Architecture', 'Cloud'],
    topics: ['Compute'],
    areasOfInterest: ['Generative AI'],
    industries: ['Healthcare'],
    roles: ['Developer'],
    services: ['Amazon EC2'],
    isReservable: true,
    seatAvailability: 'veryLimited',
    features: ['Interactive'],
  };
  const [session] = adaptAwsSessions([raw]);
  assert.equal(session.id, 'aws-1');
  assert.equal(session.code, 'ARC3001');
  assert.equal(session.sessionType, 'Breakout session');
  assert.equal(session.level, '300');
  assert.equal(session.levelLabel, '300 - Advanced');
  assert.equal(session.date, '2026-12-01');
  assert.equal(session.startTime, '10:15');
  assert.equal(session.endTime, '11:00');
  assert.equal(session.sourceTime.timezone, 'UTC');
  assert.equal(session.displayTimeZone, 'America/Los_Angeles');
  assert.equal(session.reservable, true);
  assert.equal(session.uiState.availability, 'veryLimited');
  assert.deepEqual(session.tracks, ['Architecture', 'Cloud']);
  assert.deepEqual(session.speakers, ['AWS Speaker']);
  assert.deepEqual(session.industries, ['Healthcare']);
  assert.deepEqual(session.roles, ['Developer']);
  assert(filterSessions([session], { query: 'healthcare' }).length);
  assert(filterSessions([session], { query: 'developer' }).length);
  assert(filterSessions([session], { query: 'Interactive' }).length);
  const optional = adaptAwsSessions([{ sessionId: 'aws-optional', title: 'Session' }])[0];
  assert.equal(optional.date, '');
  assert.equal(optional.startTime, '');
  assert.equal(optional.endTime, '');
  assert.equal(optional.reservable, null);
  assert.equal(optional.uiState.availability, 'unknown');
  const noZone = adaptAwsSessions([
    {
      sessionId: 'aws-local',
      title: 'Session',
      sessionTime: { date: '2026-12-01', time: '10:15', length: '45' },
    },
  ])[0];
  assert.equal(noZone.startTime, '10:15');
  assert.equal(noZone.endTime, '11:00');
  assert.equal(noZone.displayTimeZone, '');
  const badZone = adaptAwsSessions([
    {
      sessionId: 'aws-bad-zone',
      title: 'Session',
      sessionTime: { date: '2026-12-01', time: '10:15', timezone: 'invalid-zone' },
    },
  ])[0];
  assert.equal(badZone.startTime, '10:15');
  assert.equal(badZone.displayTimeZone, 'timezone-unavailable');
  assert.equal(adaptAwsSessions([raw, { ...raw, title: 'duplicate' }]).length, 1);
});
test('AWS seat availability bands stay distinct in the application model', () => {
  const values = ['available', 'limited', 'veryLimited', 'unavailable', 'walkUp'];
  const mapped = adaptAwsSessions(
    values.map((seatAvailability, i) => ({
      sessionId: `seat-${i}`,
      title: 'Session',
      seatAvailability,
    })),
  );
  assert.deepEqual(
    mapped.map((s) => s.uiState.availability),
    values,
  );
});
test('official side event data maps to source-linked planner items without AWS reservation state', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../side-events.verified.json', import.meta.url), 'utf8'),
  );
  const events = adaptSideEvents(raw);
  assert.equal(events.length, 7);
  assert(
    events.every(
      (s) =>
        s.itemType === 'sideEvent' &&
        s.dataSource === 'official-side-event' &&
        s.sourceUrl.startsWith('https://') &&
        s.verifiedAt === '2026-10-05',
    ),
  );
  assert(
    events.every(
      (s) =>
        s.reservable === null &&
        s.sessionType === 'Side event' &&
        s.startTime === '' &&
        s.endTime === '' &&
        s.timingStatus === 'unknown',
    ),
  );
  assert.equal(new Set(events.map((s) => s.id)).size, events.length);
});
