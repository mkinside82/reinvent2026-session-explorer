import { validDate } from './session-model.js';

export const MULTI_KEYS = [
  'date',
  'track',
  'topic',
  'level',
  'sessionType',
  'venue',
  'service',
  'speaker',
  'reservability',
];
const FILTER_KEYS = ['q', 'from', 'to', 'fit', 'walkUpOnly', ...MULTI_KEYS];
const OWNED_KEYS = new Set([
  ...FILTER_KEYS,
  'view',
  'sort',
  'kind',
  'minLevel',
  'unleveled',
  'walkUpOnly',
  'levelDefault',
]);
export const defaultFilters = () => ({
  query: '',
  from: '',
  to: '',
  fit: 'overlap',
  minLevel: null,
  includeUnleveled: false,
  walkUpOnly: false,
  levelDefaultSuppressed: false,
  ...Object.fromEntries(MULTI_KEYS.map((key) => [key, []])),
});

export function readSearchState(url) {
  const p = new URL(url).searchParams,
    f = defaultFilters();
  f.query = (p.get('q') || '').slice(0, 500);
  for (const key of MULTI_KEYS) f[key] = [...new Set(p.getAll(key).filter(Boolean))].slice(0, 50);
  f.date = f.date.filter(validDate);
  for (const key of ['from', 'to']) {
    const v = p.get(key) || '';
    f[key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '';
  }
  f.fit = p.get('fit') === 'contained' ? 'contained' : 'overlap';
  const rawMinimum = p.get('minLevel'),
    minimum = rawMinimum === null ? Number.NaN : Number(rawMinimum);
  f.minLevel = Number.isFinite(minimum) && minimum >= 0 && minimum <= 999 ? minimum : null;
  f.includeUnleveled = p.get('unleveled') === '1';
  f.walkUpOnly = p.get('walkUpOnly') === '1';
  f.levelDefaultSuppressed = p.get('levelDefault') === 'off';
  const hasFilterCondition =
    FILTER_KEYS.some((key) => p.has(key)) || p.has('minLevel') || p.has('unleveled');
  if (!hasFilterCondition && !f.levelDefaultSuppressed) f.minLevel = 200;
  return {
    filters: f,
    view: p.get('view') === 'compact' ? 'compact' : 'card',
    sort: p.get('sort') === 'title' ? 'title' : 'time',
    kind: p.get('kind') === 'sideEvents' ? 'sideEvents' : 'sessions',
    explicit: [...p.keys()].some((key) => OWNED_KEYS.has(key)),
    hasFilterCondition,
  };
}

export function searchURL(url, { filters, view, sort, kind = 'sessions' }) {
  const result = new URL(url);
  for (const key of OWNED_KEYS) result.searchParams.delete(key);
  if (filters.query) result.searchParams.set('q', filters.query);
  for (const key of MULTI_KEYS)
    for (const value of filters[key] || []) result.searchParams.append(key, value);
  for (const key of ['from', 'to']) if (filters[key]) result.searchParams.set(key, filters[key]);
  if (filters.fit === 'contained') result.searchParams.set('fit', 'contained');
  if (filters.minLevel !== null && filters.minLevel !== undefined)
    result.searchParams.set('minLevel', String(filters.minLevel));
  if (filters.includeUnleveled) result.searchParams.set('unleveled', '1');
  if (filters.walkUpOnly) result.searchParams.set('walkUpOnly', '1');
  if (filters.levelDefaultSuppressed) result.searchParams.set('levelDefault', 'off');
  if (view === 'compact') result.searchParams.set('view', 'compact');
  if (sort === 'title') result.searchParams.set('sort', 'title');
  if (kind === 'sideEvents') result.searchParams.set('kind', 'sideEvents');
  return result;
}
