import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecommendations, renderRecommendations } from '../src/recommendations.js';

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
