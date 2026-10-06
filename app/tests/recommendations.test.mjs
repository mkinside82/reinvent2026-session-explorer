import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNewsRecommendations,
  getPersonalizedRecommendations,
  getRecommendations,
  renderRecommendations,
} from '../src/recommendations.js';

test('recommendations match official trend themes to catalog entries', () => {
  const result = getRecommendations(
    [
      {
        id: 'a',
        title: 'Building production AI agents with Amazon Bedrock AgentCore',
        level: '300',
      },
    ],
    { today: '2026-10-05' },
  );
  assert.ok(
    result.some((signal) => signal.id === 'production-agents' && signal.matches[0].id === 'a'),
  );
});

test('expired trend signals disappear and output escapes catalog text', () => {
  const result = getRecommendations(
    [{ id: 'a', title: 'Agent <script>alert(1)</script>', level: '300' }],
    { today: '2026-10-20' },
  );
  assert.deepEqual(result, []);
  const active = getRecommendations(
    [{ id: 'a', title: 'Agent <script>alert(1)</script>', level: '300' }],
    { today: '2026-10-05' },
  );
  const html = renderRecommendations(active, new Set());
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(
    active.every((signal) => signal.sources.every((source) => source.url.startsWith('https://'))),
  );
});

test('cached recommendation matches update for plan conflicts, selections and interest changes', () => {
  const items = [
    {
      id: 'agent-session',
      title: 'Production AI agents with AgentCore',
      abstract: 'AI agent security and governance',
      date: '2026-12-01',
      startTime: '10:00',
      endTime: '11:00',
      level: '300',
    },
  ];
  const options = { today: '2026-10-06' };
  const first = getRecommendations(items, options);
  assert(first.some((signal) => signal.matches.some((item) => item.fitsPlan === true)));
  const conflict = getRecommendations(items, {
    ...options,
    plan: [{ id: 'busy', date: '2026-12-01', startTime: '10:30', endTime: '10:45' }],
  });
  assert(conflict.some((signal) => signal.matches.some((item) => item.fitsPlan === false)));
  const planned = getRecommendations(items, {
    ...options,
    plan: [{ id: 'agent-session' }],
  });
  assert(planned.every((signal) => !signal.matches.some((item) => item.id === 'agent-session')));
  assert.equal(
    getPersonalizedRecommendations(items, { ...options, interests: ['ai'] })[0]?.id,
    'agent-session',
  );
  assert.deepEqual(
    getPersonalizedRecommendations(items, { ...options, interests: ['serverless'] }),
    [],
  );
  const news = {
    items: [{ title: 'AI agent security', url: 'https://aws.amazon.com/blogs/aws/agent-security' }],
  };
  assert.equal(getNewsRecommendations(items, news, options)[0]?.matches[0].id, 'agent-session');
  assert.equal(
    getNewsRecommendations(items, news, { ...options, plan: [{ id: 'agent-session' }] }).length,
    0,
  );
});
