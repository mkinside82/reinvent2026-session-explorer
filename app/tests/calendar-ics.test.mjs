import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarIcs, calendarInstant } from '../src/calendar-ics.js';

const item = {
  id: 'aws-session-42',
  code: 'AIM301',
  title: 'AI, agents; and safety\nreview',
  abstract: '現地の詳細',
  date: '2026-11-30',
  startTime: '08:00',
  endTime: '09:00',
  venue: 'MGM Grand',
  room: 'Room 101',
};
test('ICS uses deterministic UID, CRLF and converts venue time to UTC without changing the event instant', () => {
  assert.equal(calendarInstant('2026-11-30', '08:00'), '2026-11-30T16:00:00.000Z');
  const { content, exported, skipped } = createCalendarIcs([item], {
    now: new Date('2026-10-05T12:34:56.000Z'),
  });
  assert.equal(exported, 1);
  assert.equal(skipped, 0);
  assert(content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert(content.endsWith('END:VCALENDAR\r\n'));
  assert.match(content, /UID:aws-session-42@reinvent-session-explorer/);
  assert.match(content, /DTSTAMP:20261005T123456Z/);
  assert.match(content, /DTSTART:20261130T160000Z/);
  assert.match(content, /DTEND:20261130T170000Z/);
  assert.match(content, /SUMMARY:AI\\, agents\\; and safety\\nreview/);
  assert(content.includes('LOCATION:MGM Grand · Room 101'));
  assert.equal(createCalendarIcs([item]).content.match(/UID:/g).length, 1);
});
test('unknown or invalid times are skipped and long UTF-8 lines are folded at 75 octets', () => {
  const long = { ...item, title: 'AWS agents 日本語 '.repeat(15) },
    unknown = { ...item, id: 'side:unknown', startTime: '', endTime: '' };
  const result = createCalendarIcs([long, unknown]);
  assert.equal(result.exported, 1);
  assert.equal(result.skipped, 1);
  assert.equal((result.content.match(/UID:/g) || []).length, 1);
  for (const line of result.content.split('\r\n').slice(0, -1))
    assert(
      new TextEncoder().encode(line).length <= 75,
      `${new TextEncoder().encode(line).length} octets: ${line}`,
    );
  assert.match(result.content, /\r\n /);
});
