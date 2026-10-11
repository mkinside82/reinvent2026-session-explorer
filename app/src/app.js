import {
  t,
  ui,
  initializeLanguage,
  setLanguage,
  getLanguage,
  getLocale,
  staticLanguageBindings,
  planSummaryLabel,
  awsScheduleSummaryLabel,
  stateLabel,
} from './i18n.js';
import {
  sessionRepository,
  sideEventRepository,
  adaptAwsPersonalTimes,
  venueLocalDateTimeToUtc,
  localSessionStatus,
  startBuilderIdSignIn,
  signOutAws,
  signOutBuilderId,
  requestCatalogRefresh,
  fetchLiveCatalog,
  fetchLiveSchedule,
  fetchRecommendationNews,
  reserveLiveSessions,
  cancelLiveReservations,
  associateLiveFavorites,
  removeLiveFavorites,
  saveLivePersonalTime,
} from './session-data.js';
import {
  createCatalog,
  sortSessions,
  conflictMap,
  minutes,
  validInterval,
} from './session-model.js';
import { createCalendarIcs } from './calendar-ics.js';
import {
  getRecommendations,
  getNewsRecommendations,
  getPersonalizedRecommendations,
  renderRecommendations,
} from './recommendations.js';
import { PLAN_KEY, readPlan, writePlan } from './plan-store.js';
import { MULTI_KEYS, defaultFilters, readSearchState, searchURL } from './search-state.js';
import {
  esc,
  dateLabel,
  timeLabel,
  japanTimeLabel,
  venueToday,
  blank,
} from './ui-utils.js?v=20261011-tz';
import {
  renderCard,
  renderCompact,
  renderPlanList,
  renderTimeline,
  renderDetail,
  renderComparison,
} from './views.js';
import { translateSessionToJapanese } from './translate.js';
const $ = (s) => document.querySelector(s);
const displayedTime = (item, referenceDate = item.date) =>
  [
    `${timeLabel(item, referenceDate)} · ${t('会場現地時間（Las Vegas）')}`,
    state.showJapanTime ? japanTimeLabel(item) : '',
  ]
    .filter(Boolean)
    .join(' · ');
const storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};
initializeLanguage(storage, globalThis.navigator?.language);
const applyStaticLanguage = staticLanguageBindings(document);
applyStaticLanguage();
$('#languageSwitch').value = getLanguage();
const runtimeMode = globalThis.REINVENT_RUNTIME?.mode === 'live' ? 'live' : 'demo';
const saved = readPlan(storage),
  initial = readSearchState(window.location.href);
if (!initial.hasFilterCondition && !initial.filters.levelDefaultSuppressed)
  initial.filters.minLevel = 200;
function sideEventFiltersFrom(filters) {
  const result = defaultFilters();
  for (const key of ['query', 'date', 'topic', 'venue'])
    result[key] = Array.isArray(result[key]) ? [...(filters[key] || [])] : filters[key] || '';
  result.minLevel = null;
  result.levelDefaultSuppressed = true;
  return result;
}
const initialSessionFilters =
  initial.kind === 'sideEvents' ? { ...defaultFilters(), minLevel: 200 } : initial.filters;
const initialSideEventFilters =
  initial.kind === 'sideEvents' ? sideEventFiltersFrom(initial.filters) : sideEventFiltersFrom({});
let recommendationInterests = [];
try {
  const stored = JSON.parse(storage.getItem('reinvent-recommendation-interests') || '[]');
  if (Array.isArray(stored))
    recommendationInterests = stored.filter((id) => typeof id === 'string');
} catch {}
let rememberedView;
try {
  rememberedView = storage.getItem('reinvent-view');
} catch {}
let showJapanTime = true;
try {
  showJapanTime = storage.getItem('reinvent-show-japan-time') !== '0';
} catch {}
const state = {
  sessions: [],
  sideEvents: [],
  catalog: createCatalog([]),
  sideEventCatalog: createCatalog([]),
  byId: new Map(),
  status: 'loading',
  source: runtimeMode,
  accountId: '',
  catalogMeta: null,
  localApiAvailable: false,
  recommendationNews: { items: [], fetchedAt: null, refreshing: false, error: null },
  awsReserved: new Set(),
  awsFavorites: new Set(),
  awsPersonalTimes: [],
  awsScheduleStatus: 'idle',
  awsScheduleFetchedAt: 0,
  icsCandidates: [],
  icsSelection: new Set(),
  icsSearch: '',
  reservationSelection: new Set(),
  reservationResults: null,
  reservationStage: 'select',
  reservationMode: 'reserve',
  reservationBusy: false,
  favoriteSelection: new Set(),
  favoriteResults: null,
  favoriteStage: 'select',
  favoriteBusy: false,
  favoritePending: new Set(),
  favoriteUnknown: new Set(),
  plan: runtimeMode === 'demo' ? saved.ids : [],
  warning: runtimeMode === 'demo' ? saved.warning : '',
  filters: initial.kind === 'sideEvents' ? initialSideEventFilters : initialSessionFilters,
  sessionFilters: initialSessionFilters,
  sideEventFilters: initialSideEventFilters,
  view: initial.explicit ? initial.view : rememberedView === 'compact' ? 'compact' : 'card',
  sort: initial.sort,
  exploreKind: initial.kind,
  exploreView: 'sessions',
  planDate: '',
  planView: 'timeline',
  showJapanTime,
  active: 'explore',
  detailId: null,
  detailTranslations: new Map(),
  recommendationInterests,
  compare: [],
  comparison: [],
  draft: null,
};
const recommendationObjectIds = new WeakMap();
let recommendationObjectSequence = 0;
let recommendationMarkupCache = { key: '', html: '' };
function recommendationObjectId(value) {
  let id = recommendationObjectIds.get(value);
  if (!id) {
    id = ++recommendationObjectSequence;
    recommendationObjectIds.set(value, id);
  }
  return id;
}
const FACET_LABELS = {
  date: 'Date',
  track: 'Track',
  topic: 'Topic',
  level: 'Level',
  sessionType: 'Session Type',
  venue: '会場',
  service: 'Service',
  speaker: 'Speaker',
  reservability: '予約可否',
  walkUpOnly: 'Walk-up Only',
};
const byId = (id) => state.byId.get(id),
  chosen = () => sortSessions(state.plan.map(byId).filter(Boolean));
const plannerItems = () => {
  const items = new Map(chosen().map((item) => [item.id, item]));
  if (state.source === 'live') {
    for (const item of state.sessions) if (state.awsReserved.has(item.id)) items.set(item.id, item);
    for (const item of state.sessions)
      if (state.awsFavorites.has(item.id)) items.set(item.id, item);
    for (const item of state.awsPersonalTimes) items.set(item.id, item);
  }
  return sortSessions([...items.values()]);
};
function calendarExportItems() {
  const items = new Map(plannerItems().map((item) => [item.id, item]));
  if (state.source === 'live' && state.awsScheduleStatus === 'ready')
    for (const item of state.sessions)
      if (state.awsFavorites.has(item.id)) items.set(item.id, item);
  const scheduleReady = state.source !== 'live' || state.awsScheduleStatus === 'ready';
  return sortSessions([...items.values()]).map((item) => {
    const reserved = scheduleReady && state.source === 'live' && state.awsReserved.has(item.id),
      favorite = scheduleReady && state.source === 'live' && state.awsFavorites.has(item.id),
      status =
        item.itemType === 'personalTime'
          ? stateLabel('Personal time')
          : item.itemType === 'sideEvent'
            ? t('イベント・体験')
            : !scheduleReady
              ? t('AWS状態未確認')
              : reserved
                ? t('予約済み')
                : favorite
                  ? t('お気に入り・未予約')
                  : t('候補・未予約');
    return {
      ...item,
      calendarReserved: reserved,
      calendarStatus: status,
      calendarStatusLine: `${t('状態')}: ${status}`,
      calendarAvailability:
        item.uiState?.availability === 'walkUp' ? t('Walk-up Only（当日参加・予約対象外）') : '',
    };
  });
}
const currentPlanKey = () =>
  state.source === 'demo'
    ? PLAN_KEY
    : state.source === 'live'
      ? ui`${PLAN_KEY}:aws:reinvent2026:${state.accountId || 'guest'}`
      : null;
const LIVE_ACCOUNT_KEY = 'reinvent-live-last-account';
function rememberedLiveAccountId() {
  try {
    const value = storage.getItem(LIVE_ACCOUNT_KEY) || '';
    return /^[a-f0-9]{64}$/.test(value) ? value : '';
  } catch {
    return '';
  }
}
function rememberLiveAccountId(accountId) {
  if (!/^[a-f0-9]{64}$/.test(accountId || '')) return;
  try {
    storage.setItem(LIVE_ACCOUNT_KEY, accountId);
  } catch {}
}
const livePlanKey = (accountId) => `${PLAN_KEY}:aws:reinvent2026:${accountId || 'guest'}`;
let controller,
  sequence = 0,
  toastTimer,
  searchTimer,
  livePollTimer,
  newsPollTimer,
  displayLimit = 40,
  facets = {},
  exploreScroll = 0,
  scheduleRefreshPromise = null,
  editingPersonalTimeId = '';
const tomorrow = () => {
  const d = new Date(ui`${venueToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const quickDefinitions = () => [
  { label: 'Today', key: 'date', value: venueToday() },
  { label: 'Tomorrow', key: 'date', value: tomorrow() },
  { label: 'AI / ML', key: 'track', value: 'AI / ML', separator: true },
  { label: 'Generative AI', key: 'topic', value: 'Generative AI' },
  { label: 'Architecture', key: 'topic', value: 'Architecture' },
  { label: 'Serverless', key: 'topic', value: 'Serverless' },
  { label: 'Containers', key: 'topic', value: 'Containers' },
  { label: 'Security', key: 'track', value: 'Security' },
  { label: 'Database', key: 'track', value: 'Databases' },
  { label: 'SaaS', key: 'track', value: 'SaaS' },
  { label: 'Developer Tools', key: 'track', value: 'Developer Tools' },
  { label: 'Level 200+', key: 'minLevel', value: 200, separator: true },
  { label: t('レベル未設定'), key: 'includeUnleveled', value: true },
  ...[200, 300, 400, 500].map((n, i) => ({
    label: 'Level ' + n,
    key: 'level',
    value: String(n),
    separator: i === 0,
  })),
  ...['Breakout session', 'Chalk talk', 'Workshop', 'Builders’ session'].map((v, i) => ({
    label: ['Breakout', 'Chalk Talk', 'Workshop', "Builders' Session"][i],
    key: 'sessionType',
    value: v,
    separator: i === 0,
  })),
];
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 2800);
}
async function copySessionCode(code, button) {
  let copied = false;
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(code);
      copied = true;
    }
  } catch {}
  if (!copied) {
    const field = document.createElement('textarea');
    field.value = code;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    try {
      copied = document.execCommand('copy');
    } catch {}
    field.remove();
  }
  if (copied) {
    button.classList.add('is-copied');
    button.setAttribute('aria-label', `${t('セッションコードをコピーしました')}: ${code}`);
    button.title = t('セッションコードをコピーしました');
    setTimeout(() => {
      button.classList.remove('is-copied');
      button.setAttribute('aria-label', `${t('セッションコードをコピー')} ${code}`);
      button.title = t('セッションコードをコピー');
    }, 1400);
  }
  notify(
    copied
      ? `${t('セッションコードをコピーしました')}: ${code}`
      : t('コピーに失敗しました。ブラウザーの権限を確認してください。'),
  );
}
function syncURL(push = false) {
  const url = searchURL(window.location.href, {
    filters: state.filters,
    view: state.view,
    sort: state.sort,
    kind: state.exploreKind,
  });
  if (url.href !== window.location.href) {
    try {
      window.history[push ? 'pushState' : 'replaceState'](null, '', url.href);
    } catch {}
  }
}
function results() {
  if (state.exploreKind === 'sideEvents')
    return state.sideEventCatalog.search(state.filters, state.sort);
  const sessions = state.catalog.search(state.filters, state.sort);
  return state.exploreKind === 'favorites'
    ? sessions.filter((item) => state.awsFavorites.has(item.id))
    : sessions;
}
function quickPressed(d) {
  if (d.key === 'minLevel')
    return Number.isFinite(state.filters.minLevel) && state.filters.minLevel === Number(d.value);
  if (d.key === 'includeUnleveled') return state.filters.includeUnleveled;
  return state.filters[d.key].includes(d.value);
}
function activeFilterKeys() {
  return state.exploreKind === 'sideEvents' ? ['date', 'topic', 'venue'] : MULTI_KEYS;
}
function renderQuick() {
  const defs = state.exploreKind === 'sideEvents' ? [] : quickDefinitions();
  $('#quickFilters').innerHTML = defs
    .map(
      (d) =>
        ui`${d.separator ? '<span class="quick-divider" aria-hidden="true"></span>' : ''}<button class="quick-chip" data-quick-key="${d.key}" data-quick-value="${esc(d.value)}" aria-pressed="${quickPressed(d)}">${t(d.label)}</button>`,
    )
    .join('');
}
function renderApplied() {
  const chips = [];
  let count = 0;
  for (const key of activeFilterKeys())
    for (const value of state.filters[key]) {
      count++;
      chips.push(
        ui`<button class="filter-chip" data-remove-filter="${key}" data-filter-value="${esc(value)}" aria-label="${t(FACET_LABELS[key])} ${esc(facetValueLabel(key, value))}を解除">${t(FACET_LABELS[key])}: ${esc(facetValueLabel(key, value))} <span aria-hidden="true">×</span></button>`,
      );
    }
  if (state.exploreKind !== 'sideEvents' && Number.isFinite(state.filters.minLevel)) {
    count++;
    chips.push(
      ui`<button class="filter-chip" data-remove-filter="minLevel" aria-label="Level ${state.filters.minLevel}以上を解除">Level ${state.filters.minLevel}以上 <span aria-hidden="true">×</span></button>`,
    );
  }
  if (state.exploreKind !== 'sideEvents' && state.filters.includeUnleveled) {
    count++;
    chips.push(
      t(
        '<button class="filter-chip" data-remove-filter="includeUnleveled" aria-label="レベル未設定を解除">レベル未設定 <span aria-hidden="true">×</span></button>',
      ),
    );
  }
  if (state.exploreKind !== 'sideEvents' && state.filters.walkUpOnly) {
    count++;
    chips.push(
      t(
        '<button class="filter-chip" data-remove-filter="walkUpOnly" aria-label="Walk-up Onlyを解除">Walk-up Only <span aria-hidden="true">×</span></button>',
      ),
    );
  }
  if (state.exploreKind !== 'sideEvents' && (state.filters.from || state.filters.to)) {
    count++;
    chips.push(
      ui`<button class="filter-chip" data-remove-filter="time" aria-label="時間の条件を解除">${state.filters.fit === 'contained' ? t('枠内') : 'Time'}: ${esc(state.filters.from || '00:00')}–${esc(state.filters.to || '24:00')} <span aria-hidden="true">×</span></button>`,
    );
  }
  $('#activeFilters').innerHTML =
    chips.join('') +
    (chips.length
      ? ui`<button class="quiet small" data-action="resetFilters">Clear all</button>`
      : '');
  $('#filterCount').textContent = count;
  $('#filterCount').hidden = !count;
  $('#clearSearch').hidden = !state.filters.query;
}
function renderTray() {
  const items = state.compare.map(byId).filter(Boolean);
  $('#compareTray').hidden = !items.length;
  $('#compareTray').innerHTML =
    ui`<span>${items.length} / 3件を比較対象に選択 · ${items.map((s) => esc(s.code || s.title)).join(' / ')}</span><button class="primary small" data-action="compareSelected" ${items.length < 2 ? 'disabled' : ''}>Compare</button><button class="quiet small" data-action="clearCompare">解除</button>`;
}
function renderExplore(map) {
  const found = results(),
    plan = new Set(state.plan),
    sideMode = state.exploreKind === 'sideEvents',
    favoriteMode = state.exploreKind === 'favorites',
    favoritesEnabled = state.source === 'live' && state.localApiAvailable && !!state.accountId;
  $('#resultCount').textContent = sideMode
    ? ui`${found.length.toLocaleString(getLocale())} events & experiences`
    : state.status === 'loading'
      ? t('読み込み中')
      : state.status === 'error'
        ? t('取得できませんでした')
        : state.status === 'unauthenticated'
          ? t('サインインが必要です')
          : favoriteMode
            ? ui`${found.length.toLocaleString(getLocale())} ${t('AWSお気に入り')}`
            : ui`${found.length.toLocaleString(getLocale())} sessions`;
  $('#cards').setAttribute('aria-busy', String(!sideMode && state.status === 'loading'));
  if (sideMode && !state.sideEvents.length)
    $('#cards').innerHTML = blank(
      t('掲載中のイベント・体験はありません'),
      t('出典を確認できたイベントを追加します。'),
    );
  else if (sideMode && !found.length)
    $('#cards').innerHTML = blank(
      t('一致するイベントがありません'),
      t('キーワードやFilterを少し減らしてお試しください。'),
      t('<button data-action="resetAll" class="quiet">検索とFilterをクリア</button>'),
    );
  else if (sideMode) {
    const subset = found.slice(0, displayLimit);
    $('#cards').innerHTML =
      (state.view === 'compact'
        ? renderCompact(
            subset,
            plan,
            map,
            state.compare,
            favoritesEnabled,
            state.favoritePending,
            state.favoriteUnknown,
            state.showJapanTime,
          )
        : subset
            .map((s) =>
              renderCard(
                s,
                plan,
                map,
                state.compare,
                favoritesEnabled,
                state.favoritePending.has(s.id),
                state.favoriteUnknown.has(s.id),
                state.showJapanTime,
              ),
            )
            .join('')) +
      (found.length > displayLimit
        ? ui`<button class="quiet" data-action="more">さらに40件を表示（残り${found.length - displayLimit}件）</button>`
        : '');
  } else if (state.status === 'loading')
    $('#cards').innerHTML =
      '<div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div>';
  else if (state.status === 'unauthenticated')
    $('#cards').innerHTML = blank(
      t('AWS Builder IDでサインインしてください'),
      t('AWSの実カタログを読むには、イベント登録済みのアカウントが必要です。'),
      '<button data-action="signIn" class="primary">Builder ID sign-in</button>',
    );
  else if (state.status === 'error')
    $('#cards').innerHTML = blank(
      t('セッションを取得できませんでした'),
      t('通信状態を確認して、もう一度お試しください。'),
      t('<button data-action="retry" class="primary">再試行</button>'),
    );
  else if (!state.sessions.length)
    $('#cards').innerHTML = blank(
      state.source === 'live'
        ? t('AWSカタログを取得しています')
        : t('セッションデータがまだありません'),
      state.source === 'live'
        ? t('最初のページを受信すると、続きの取得中も結果を表示します。')
        : t('データが公開されると、ここに表示されます。'),
      t('<button data-action="retry" class="quiet">再読み込み</button>'),
    );
  else if (!found.length)
    $('#cards').innerHTML = favoriteMode
      ? blank(
          t('AWSお気に入りはありません'),
          t('AWS側でお気に入りにしたセッションが、Scheduleの更新後にここへ表示されます。'),
        )
      : blank(
          t('一致するセッションがありません'),
          t('キーワードやFilterを少し減らしてお試しください。'),
          t('<button data-action="resetAll" class="quiet">検索とFilterをクリア</button>'),
        );
  else {
    const subset = found.slice(0, displayLimit);
    $('#cards').innerHTML =
      (state.view === 'compact'
        ? renderCompact(
            subset,
            plan,
            map,
            state.compare,
            favoritesEnabled,
            state.favoritePending,
            state.favoriteUnknown,
            state.showJapanTime,
          )
        : subset
            .map((s) =>
              renderCard(
                s,
                plan,
                map,
                state.compare,
                favoritesEnabled,
                state.favoritePending.has(s.id),
                state.favoriteUnknown.has(s.id),
                state.showJapanTime,
              ),
            )
            .join('')) +
      (found.length > displayLimit
        ? ui`<button class="quiet" data-action="more">さらに40件を表示（残り${found.length - displayLimit}件）</button>`
        : '');
  }
  for (const [id, value] of [
    ['cardView', 'card'],
    ['compactView', 'compact'],
  ]) {
    $('#' + id).classList.toggle('selected', state.view === value);
    $('#' + id).setAttribute('aria-pressed', String(state.view === value));
  }
  $('#sort').value = state.sort;
}
function renderPlan(items, map) {
  const conflicted = items.filter((s) => map.get(s.id)?.length),
    dates = [
      ...new Set(
        [...state.sessions, ...state.sideEvents]
          .flatMap((s) => [s.date, s.endTime === '00:00' ? '' : s.endDate])
          .filter(Boolean),
      ),
    ].sort();
  if (!state.planDate && state.status === 'ready') {
    const plannedDates = [...new Set(items.map((s) => s.date).filter(Boolean))].sort();
    state.planDate =
      plannedDates.find((date) => date >= venueToday()) ||
      plannedDates.at(-1) ||
      (dates.includes(venueToday()) ? venueToday() : dates[0] || '');
  }
  const allDates = [
    ...new Set([
      ...dates,
      ...(state.planDate && !['all', 'unknown'].includes(state.planDate) ? [state.planDate] : []),
    ]),
  ].sort();
  $('#planDate').innerHTML =
    allDates
      .map(
        (date) =>
          ui`<option value="${date}">${esc(dateLabel(date))}${date === venueToday() ? t(' · 今日') : ''}</option>`,
      )
      .join('') +
    t('<option value="all">すべての日付</option><option value="unknown">日付未定</option>');
  $('#planDate').value = state.planDate;
  $('#clearPlan').disabled = !state.plan.length;
  const exportableFavorite =
    state.source === 'live' &&
    state.awsScheduleStatus === 'ready' &&
    state.sessions.some((item) => state.awsFavorites.has(item.id) && validInterval(item));
  $('#exportCalendar').disabled = !items.some(validInterval) && !exportableFavorite;
  const reservationAvailable =
    state.source === 'live' && state.localApiAvailable && !!state.accountId;
  const favoriteCandidates = chosen().filter((s) => s.dataSource === 'aws'),
    unfavoritedCount = favoriteCandidates.filter(
      (s) => !state.awsFavorites.has(s.id) && !state.favoriteUnknown.has(s.id),
    ).length;
  $('#favoritePlanned').hidden = !reservationAvailable || !favoriteCandidates.length;
  $('#favoritePlanned').disabled = !unfavoritedCount || state.favoriteBusy;
  $('#favoritePlanned').textContent =
    ui`${t('PlanのAWSセッションをお気に入りに追加')} · ${unfavoritedCount}`;
  $('#reservePlanned').hidden = !reservationAvailable;
  $('#manageReservations').hidden = !reservationAvailable;
  $('#addPersonalTime').hidden = !reservationAvailable;
  $('#refreshSchedule').hidden = !reservationAvailable;
  $('#refreshSchedule').disabled = state.awsScheduleStatus === 'loading';
  $('#refreshScheduleHelp').hidden = !reservationAvailable;
  $('#planCount').textContent = items.length;
  $('#mobilePlanCount').textContent = items.length;
  $('#navConflict').hidden = !conflicted.length;
  const localCount = state.plan.length;
  const scheduleStatus = $('#awsScheduleStatus');
  scheduleStatus.hidden = !reservationAvailable;
  scheduleStatus.textContent =
    state.awsScheduleStatus === 'loading'
      ? t('AWS Scheduleから予約・お気に入り・個人予定を取得中です。')
      : state.awsScheduleStatus === 'error'
        ? t(
            'AWSから予約・お気に入り・個人予定を取得できませんでした。表示中の情報は保持しています。',
          )
        : state.awsScheduleStatus === 'ready'
          ? awsScheduleSummaryLabel({
              reservations: state.awsReserved.size,
              favorites: state.awsFavorites.size,
              personalTimes: state.awsPersonalTimes.length,
              localPicks: localCount,
            })
          : '';
  scheduleStatus.classList.toggle('is-error', state.awsScheduleStatus === 'error');
  $('#planSummary').innerHTML =
    ui`<p class="plan-summary">${esc(planSummaryLabel(items.length, new Set(items.map((s) => s.date).filter(Boolean)).size))}</p>` +
    (conflicted.length
      ? ui`<div class="conflict-banner"><strong>Schedule Conflict</strong> · ${conflicted.length}件の予定で重複<br>Compareで内容を比べて選択できます。</div>`
      : '');
  for (const [id, value] of [
    ['listView', 'list'],
    ['timelineView', 'timeline'],
  ]) {
    $('#' + id).classList.toggle('selected', state.planView === value);
    $('#' + id).setAttribute('aria-pressed', String(state.planView === value));
  }
  const rows = items.filter(
    (s) =>
      state.planDate === 'all' ||
      (state.planDate === 'unknown'
        ? !s.date
        : s.date &&
          s.date <= state.planDate &&
          ((s.endDate || s.date) > state.planDate ||
            ((s.endDate || s.date) === state.planDate && s.endTime !== '00:00'))),
  );
  let content;
  if (!items.length && state.awsScheduleStatus === 'loading' && reservationAvailable)
    content = blank(
      t('AWS Scheduleを確認しています'),
      t('セッション検索と他の操作はそのまま利用できます。'),
    );
  else if (!items.length)
    content = blank(
      t('My Planはまだ空です'),
      t('気になるセッションを追加して、1日の予定を組み立てましょう。'),
      t('<button data-action="browse" class="primary">セッションを探す</button>'),
    );
  else if (state.status === 'loading')
    content = blank(t('候補を読み込んでいます'), t('保存済みのMy Planを確認しています。'));
  else if (state.status === 'error')
    content = blank(
      t('保存した候補を表示できません'),
      t('候補のIDは保持しています。セッションを再取得してください。'),
      t('<button data-action="retry" class="quiet">再試行</button>'),
    );
  else if (!rows.length)
    content = blank(
      t('この日の候補はありません'),
      t('日付を切り替えるか、セッションを追加してください。'),
    );
  else if (state.planView === 'list')
    content = renderPlanList(
      rows,
      map,
      state.planDate === 'all',
      new Set(state.plan),
      reservationAvailable,
      state.favoritePending,
      state.favoriteUnknown,
      state.planDate === 'all' || state.planDate === 'unknown' ? '' : state.planDate,
      state.showJapanTime,
    );
  else if (state.planDate === 'all')
    content = blank(
      t('Timelineの日付を選んでください'),
      t('1日ずつ選ぶと、予定と空き時間を確認できます。'),
    );
  else
    content = renderTimeline(
      rows,
      map,
      state.planDate,
      new Set(state.plan),
      reservationAvailable,
      state.favoritePending,
      state.favoriteUnknown,
      state.showJapanTime,
    );
  const missing = state.plan.filter((id) => !byId(id));
  if (state.status === 'ready' && missing.length)
    content += ui`<div class="notice" style="margin-top:14px">現在のデータにない候補が${missing.length}件あります。${missing.map((id) => ui`<div>${esc(id)} <button class="remove-button" data-remove-plan="${esc(id)}">削除</button></div>`).join('')}</div>`;
  const scroll = $('#planContent').querySelector?.('.timeline-scroll')?.scrollTop || 0;
  $('#planContent').innerHTML = content;
  const timeline = $('#planContent').querySelector?.('.timeline-scroll');
  if (timeline) timeline.scrollTop = scroll;
}
function renderNavigation() {
  const plan = state.active === 'plan';
  document.body.classList.toggle('plan-focus', plan);
  for (const [id, selected] of [
    ['showSessions', !plan],
    ['showPlan', plan],
    ['mobileExplore', !plan],
    ['mobilePlan', plan],
  ]) {
    $('#' + id).classList.toggle('selected', selected);
    $('#' + id).setAttribute('aria-pressed', String(selected));
  }
  $('#sessionsPanel').classList.toggle('mobile-hidden', plan);
  $('#planPanel').classList.toggle('mobile-active', plan);
  document.body.classList.toggle('mobile-planning', plan);
}
function changeActive(value, { restore = true } = {}) {
  if (state.active === 'explore') exploreScroll = window.scrollY || 0;
  state.active = value;
  renderNavigation();
  if (value === 'plan') void refreshAwsSchedule();
  if (window.matchMedia?.('(max-width: 900px)').matches)
    window.scrollTo?.({
      top: value === 'explore' && restore ? exploreScroll : 0,
      behavior: 'instant',
    });
}
function renderSourceInfo() {
  const live = state.source === 'live';
  $('#sourceControls').hidden = false;
  $('#sourceBadge').hidden = live;
  $('#sourceBadge').textContent = t(live ? 'AWS接続' : 'プレビュー');
  $('#sourceBadge').classList.toggle('live-badge', live);
  $('#demoMode').hidden = true;
  $('#liveMode').hidden = true;
  $('#signIn').hidden = !live || !state.localApiAvailable || !!state.accountId;
  $('#refreshLive').hidden = !live || !state.localApiAvailable || !state.accountId;
  $('#signOut').hidden = !live || !state.localApiAvailable || !state.accountId;
  $('#sourceDescription').textContent = live
    ? state.localApiAvailable
      ? t(
          'AWS Events API · re:Invent 2026 · AWS予約をMy Planに同期。候補はアカウント別にローカル保存します。',
        )
      : t('AWS接続用サーバーに接続できません。アプリを再起動してください。')
    : t(
        'プレビュー（サンプルデータ） · 予約・空席情報はサンプルです。My Planへの追加は予約ではありません。',
      );
  $('#timeContext').textContent = live
    ? t(
        'すべての時刻はLas Vegas現地時間です。AWSに使えるtimezone情報がない場合、このアプリでは現地時間と仮定します。',
      )
    : t('すべての時刻はLas Vegas現地時間です。');
  $('#showJapanTime').checked = state.showJapanTime;
  const meta = state.catalogMeta;
  let note = '';
  if (live && meta) {
    if (meta.refreshing)
      note = ui`AWS catalog取得中 · ${meta.pages}ページ受信${meta.totalCount === null ? '' : ui` · totalCount ${meta.totalCount}`}`;
    else if (meta.error)
      note = ui`最新取得に失敗しました（${meta.error}）。表示中のcacheは保持しています。`;
    else if (meta.complete)
      note = ui`${meta.pages}ページを取得 · 更新 ${meta.fetchedAt ? new Date(meta.fetchedAt * 1000).toLocaleString(getLocale()) : t('時刻不明')}${meta.totalCount === null ? '' : ui` · totalCount ${meta.totalCount}`}`;
    else if (meta.fetchedAt)
      note = ui`未完了のcache · ${meta.pages}ページ取得済み · 続きの取得を再試行できます。`;
  }
  $('#catalogNotice').textContent = note;
  $('#catalogNotice').hidden = !note;
  $('#planFootnote').textContent = live
    ? state.accountId
      ? t(
          'AWSの予約・お気に入り・個人予定はAWSから取得 · 候補はこのアカウントのブラウザーに保存 · 候補を外してもAWS予約は解除されません',
        )
      : t('候補はこのブラウザーに保存 · サインイン後にアカウント別で引き継ぎ')
    : t('候補はこのブラウザーに保存 · AWS予約とは未同期');
}
function renderKindSwitch() {
  for (const [id, kind] of [
    ['showSessionItems', 'sessions'],
    ['showSideEvents', 'sideEvents'],
    ['showAwsFavorites', 'favorites'],
  ]) {
    $('#' + id).classList.toggle('selected', state.exploreKind === kind);
    $('#' + id).setAttribute('aria-pressed', String(state.exploreKind === kind));
  }
  $('#showAwsFavorites').hidden = state.source !== 'live' || !state.accountId;
  $('#showAwsFavorites').textContent = ui`${t('AWSお気に入り')}（${state.awsFavorites.size}）`;
  const recommendationsActive = state.exploreView === 'recommendations';
  $('#showRecommendations').hidden = state.source !== 'live';
  $('#showRecommendations').textContent = t('おすすめ');
  $('#showRecommendations').classList.toggle('selected', recommendationsActive);
  $('#showRecommendations').setAttribute('aria-pressed', String(recommendationsActive));
  $('#showSessionItems').classList.toggle(
    'selected',
    !recommendationsActive && state.exploreKind === 'sessions',
  );
  $('#showSideEvents').classList.toggle(
    'selected',
    !recommendationsActive && state.exploreKind === 'sideEvents',
  );
  $('#showAwsFavorites').classList.toggle(
    'selected',
    !recommendationsActive && state.exploreKind === 'favorites',
  );
  for (const id of ['showSessionItems', 'showSideEvents', 'showAwsFavorites'])
    $('#' + id).setAttribute(
      'aria-pressed',
      String(!recommendationsActive && $('#' + id).classList.contains('selected')),
    );
  $('.search-row').hidden = recommendationsActive;
  $('#quickFilters').hidden = recommendationsActive;
  $('.result-toolbar').hidden = recommendationsActive;
  $('#activeFilters').hidden = recommendationsActive;
  $('#cards').hidden = recommendationsActive;
  $('#recommendations').hidden = !recommendationsActive;
}
function reservationCandidates() {
  return chosen().filter((item) => item.dataSource === 'aws');
}
function plannedFavoriteCandidates() {
  return chosen().filter((item) => item.dataSource === 'aws');
}
function renderFavoriteDialog() {
  const candidates = plannedFavoriteCandidates(),
    selectedIds = [...state.favoriteSelection],
    selected = selectedIds.map(byId).filter(Boolean),
    body = $('#favoriteBody'),
    next = $('#favoriteNext'),
    back = $('#favoriteBack');
  $('#favoriteHeading').textContent = t('AWSお気に入りに追加するセッションを選択');
  if (state.favoriteStage === 'results') {
    const failures = new Map(
      (state.favoriteResults?.failed || []).map((row) => [row.sessionId, row]),
    );
    const unknown = new Set(state.favoriteResults?.unknown || []);
    const successful = new Set(state.favoriteResults?.successful || []);
    body.innerHTML = selected
      .map((item) => {
        const failure = failures.get(item.id),
          confirmed = successful.has(item.id) && state.favoriteResults?.scheduleConfirmed,
          label = confirmed
            ? t('お気に入り登録済み・Scheduleで確認済み')
            : unknown.has(item.id)
              ? t('登録結果不明・Scheduleで未確認')
              : failure
                ? t('AWSがお気に入りを受け付けませんでした')
                : successful.has(item.id)
                  ? t('AWS応答成功・Schedule未確認')
                  : t('お気に入り登録に失敗しました'),
          statusClass = confirmed
            ? 'confirmed'
            : failure
              ? 'failed'
              : unknown.has(item.id)
                ? 'unknown'
                : 'confirmed';
        return ui`<div class="reservation-result"><strong class="${statusClass}">${esc(label)}</strong><span>${esc(item.title)} · ${esc(item.code)}</span>${failure ? ui`<small>${esc(favoriteFailureLabel(failure.code))}</small>` : ''}</div>`;
      })
      .join('');
    $('#favoriteIntro').textContent = state.favoriteResults?.scheduleConfirmed
      ? t('AWS Scheduleでお気に入り登録を確認しました。')
      : t('AWS Scheduleを再読込できませんでした。結果を確認してください。');
    next.hidden = true;
    back.textContent = t('閉じる');
    return;
  }
  if (state.favoriteStage === 'confirm') {
    body.innerHTML = ui`<p class="reservation-warning">${t('選択したセッションをAWSお気に入りに登録します。予約は行いません。')}</p><ul class="action-preview">${selected.map((item) => ui`<li>${esc(item.title)} · ${esc(item.code)} · ${esc(dateLabel(item.date))} ${esc(displayedTime(item))}</li>`).join('')}</ul>`;
    $('#favoriteIntro').textContent = t('登録対象を確認してください。');
    next.textContent = t('この内容でAWSへ登録');
    next.hidden = false;
    next.disabled = !selected.length || state.favoriteBusy;
    back.textContent = t('選択へ戻る');
    return;
  }
  const tooMany = state.favoriteSelection.size >= 10;
  body.innerHTML = candidates.length
    ? candidates
        .map((item) => {
          const favorited = state.awsFavorites.has(item.id),
            unknown = state.favoriteUnknown.has(item.id),
            checked = state.favoriteSelection.has(item.id),
            disabled = favorited || unknown || (!checked && tooMany),
            note = favorited
              ? t('AWSお気に入り登録済み')
              : unknown
                ? t('お気に入り結果不明 · AWS Scheduleを更新してください')
                : t('お気に入りに追加予定');
          return ui`<label class="reservation-choice ${disabled ? 'is-disabled' : ''}"><input type="checkbox" data-favorite-select="${esc(item.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${esc(item.title)}</strong><small>${esc(item.code)} · ${esc(dateLabel(item.date))} ${esc(displayedTime(item))} · ${note}</small></span></label>`;
        })
        .join('')
    : blank(t('PlanにAWSセッションがありません'), t('AWSセッションをMy Planに追加してください。'));
  $('#favoriteIntro').textContent = t('お気に入り対象を最大10件選んでください。');
  next.textContent = ui`${t('選択内容を確認')}（${state.favoriteSelection.size}/10）`;
  next.hidden = false;
  next.disabled = !state.favoriteSelection.size || state.favoriteBusy;
  back.textContent = t('閉じる');
}
function openFavoriteDialog() {
  if (state.source !== 'live' || !state.localApiAvailable || !state.accountId) return;
  const candidates = plannedFavoriteCandidates().filter(
    (item) => !state.awsFavorites.has(item.id) && !state.favoriteUnknown.has(item.id),
  );
  state.favoriteSelection = new Set(candidates.slice(0, 10).map((item) => item.id));
  state.favoriteResults = null;
  state.favoriteStage = 'select';
  render();
  renderFavoriteDialog();
  openDialog('favoriteDialog');
}
async function submitFavoriteBatch() {
  const ids = [...state.favoriteSelection];
  if (!ids.length || ids.length > 10 || state.favoriteBusy) return;
  const button = $('#favoriteNext');
  state.favoriteBusy = true;
  button.disabled = true;
  try {
    state.favoriteResults = await associateLiveFavorites(ids);
    for (const id of state.favoriteResults.successful || []) state.awsFavorites.add(id);
    for (const id of state.favoriteResults.unknown || []) state.favoriteUnknown.add(id);
    if (!state.favoriteResults.scheduleConfirmed)
      for (const id of state.favoriteResults.successful || []) state.favoriteUnknown.add(id);
    state.favoriteStage = 'results';
    render();
    renderFavoriteDialog();
    const scheduleRefreshed = await refreshAwsSchedule({ force: true });
    if (scheduleRefreshed && state.favoriteResults) {
      state.favoriteResults.scheduleConfirmed = true;
      const successful = new Set(state.favoriteResults.successful || []),
        failed = state.favoriteResults.failed || [],
        unknown = new Set(state.favoriteResults.unknown || []);
      for (const id of ids) {
        if (state.awsFavorites.has(id)) {
          successful.add(id);
          unknown.delete(id);
        } else if (successful.has(id)) {
          successful.delete(id);
          unknown.add(id);
        }
      }
      state.favoriteResults.successful = [...successful];
      state.favoriteResults.unknown = [...unknown];
      state.favoriteResults.failed = failed.filter((row) => !state.awsFavorites.has(row.sessionId));
    }
    renderFavoriteDialog();
    render();
  } catch (error) {
    const ambiguous =
      error.message === 'FAVORITE_OUTCOME_UNKNOWN' || !error.status || error.status >= 500;
    if (ambiguous) {
      state.favoriteResults = {
        successful: [],
        failed: [],
        unknown: ids,
        scheduleConfirmed: false,
      };
      state.favoriteStage = 'results';
      for (const id of ids) state.favoriteUnknown.add(id);
      const scheduleRefreshed = await refreshAwsSchedule({ force: true });
      if (scheduleRefreshed) {
        state.favoriteResults.scheduleConfirmed = true;
        for (const id of ids) {
          if (state.awsFavorites.has(id)) {
            state.favoriteResults.successful.push(id);
            state.favoriteResults.unknown = state.favoriteResults.unknown.filter(
              (value) => value !== id,
            );
          }
        }
      }
      renderFavoriteDialog();
      render();
      return;
    }
    const messages = {
      SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
      EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
      RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
      FAVORITES_CLOSED: 'AWSがお気に入りの更新を受け付けていません。時間をおいてください。',
      FAVORITE_OUTCOME_UNKNOWN:
        '登録結果を確認できません。再送せず、AWS Scheduleでお気に入りを確認してください。',
    };
    notify(t(messages[error.message] || 'AWSお気に入りを更新できませんでした。'));
  } finally {
    state.favoriteBusy = false;
    if ($('#favoriteDialog').open) renderFavoriteDialog();
  }
}
async function toggleAwsFavorite(id) {
  const item = byId(id);
  if (!item || item.dataSource !== 'aws' || state.favoritePending.has(id)) return;
  if (state.source !== 'live' || !state.localApiAvailable || !state.accountId) return;
  const wasFavorited = state.awsFavorites.has(id);
  state.favoritePending.add(id);
  render();
  if (state.detailId) renderCurrentDetail();
  try {
    const result = wasFavorited
      ? await removeLiveFavorites([id])
      : await associateLiveFavorites([id]);
    const successIds = wasFavorited ? result.removed || [] : result.successful || [],
      failure = (result.failed || []).find((row) => row.sessionId === id),
      unknown = (result.unknown || []).includes(id);
    if (unknown || (successIds.includes(id) && !result.scheduleConfirmed))
      state.favoriteUnknown.add(id);
    if (successIds.includes(id)) {
      if (wasFavorited) state.awsFavorites.delete(id);
      else state.awsFavorites.add(id);
      for (const session of state.sessions)
        if (session.id === id && session.uiState) session.uiState.favorite = !wasFavorited;
    }
    const scheduleRefreshed = await refreshAwsSchedule({ force: true });
    if (
      state.awsFavorites.has(id) === !wasFavorited &&
      (scheduleRefreshed || result.scheduleConfirmed)
    ) {
      notify(t(wasFavorited ? 'AWSお気に入りから削除しました' : 'AWSお気に入りに追加しました'));
    } else if (successIds.includes(id)) {
      notify(t('AWS応答は成功しましたがScheduleで未確認です。更新して状態を確認してください。'));
    } else if (unknown) {
      notify(t('結果を確認できません。再送せず、AWS Scheduleのお気に入りを確認してください。'));
    } else if (failure) {
      notify(favoriteFailureLabel(failure.code));
    } else {
      notify(t('AWSお気に入りを更新できませんでした。'));
    }
  } catch (error) {
    const ambiguous =
      error.message === 'FAVORITE_OUTCOME_UNKNOWN' || !error.status || error.status >= 500;
    if (ambiguous) {
      state.favoriteUnknown.add(id);
      const scheduleRefreshed = await refreshAwsSchedule({ force: true });
      if (scheduleRefreshed && state.awsFavorites.has(id) === !wasFavorited) {
        notify(t(wasFavorited ? 'AWSお気に入りから削除しました' : 'AWSお気に入りに追加しました'));
      } else if (scheduleRefreshed) {
        notify(t('AWSお気に入りを更新できませんでした。'));
      } else {
        notify(t('結果を確認できません。再送せず、AWS Scheduleのお気に入りを確認してください。'));
      }
      return;
    }
    const messages = {
      SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
      EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
      RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
      FAVORITES_CLOSED: 'AWSがお気に入りの更新を受け付けていません。時間をおいてください。',
      FAVORITE_OUTCOME_UNKNOWN:
        '結果を確認できません。再送せず、AWS Scheduleでお気に入りを確認してください。',
    };
    notify(t(messages[error.message] || 'AWSお気に入りを更新できませんでした。'));
  } finally {
    state.favoritePending.delete(id);
    if (state.detailId) renderCurrentDetail();
    render();
  }
}
function renderReservationDialog() {
  const candidates = reservationCandidates(),
    selectedIds = [...state.reservationSelection],
    selected = selectedIds.map(byId).filter(Boolean),
    conflicts = conflictMap(plannerItems());
  const body = $('#reservationBody'),
    next = $('#reservationNext'),
    back = $('#reservationBack'),
    cancel = state.reservationMode === 'cancel';
  $('#reservationHeading').textContent = t(
    cancel ? '予約を解除するセッションを選択' : 'AWSへ予約するセッションを選択',
  );
  if (cancel) {
    if (state.reservationStage === 'results') {
      const failed = new Map(
        (state.reservationResults?.failed || []).map((row) => [row.sessionId, row.code]),
      );
      const done = new Set(state.reservationResults?.cancelled || []),
        unknown = new Set(state.reservationResults?.unknown || []);
      body.innerHTML = selectedIds
        .map((id) => {
          const item = byId(id),
            code = failed.get(id);
          const label = done.has(id)
            ? t('予約解除済み・AWS Scheduleで確認済み')
            : unknown.has(id)
              ? t('解除結果不明・Scheduleを確認してください')
              : t('予約を解除できませんでした');
          return ui`<div class="reservation-result"><strong class="${done.has(id) ? 'confirmed' : code ? 'failed' : 'unknown'}">${esc(label)}</strong><span>${esc(item?.title || id)} · ${esc(item?.code || id)}</span>${code ? ui`<small>${esc(reservationFailureLabel(code))}</small>` : ''}</div>`;
        })
        .join('');
      $('#reservationIntro').textContent = state.reservationResults?.scheduleConfirmed
        ? t('AWS Scheduleを再読込し、解除結果を照合しました。')
        : t('AWS Scheduleを再読込できませんでした。解除結果を確認してください。');
      next.hidden = true;
      back.textContent = t('閉じる');
    } else if (state.reservationStage === 'confirm') {
      body.innerHTML = ui`<p class="reservation-warning">${t('選択した予約をAWSから1件ずつ解除します。この操作はMy Planの候補を削除しません。')}</p><ul class="action-preview">${selectedIds
        .map((id) => {
          const item = byId(id);
          return ui`<li>${esc(item?.title || id)} · ${esc(item?.code || id)}</li>`;
        })
        .join(
          '',
        )}</ul><p class="hint">${t('解除後にAWS Scheduleを再読込し、セッションごとに結果を表示します。')}</p>`;
      next.textContent = t('選択した予約を解除');
      next.hidden = false;
      next.disabled = false;
      back.textContent = t('選択へ戻る');
    } else {
      const reserved = [...state.awsReserved];
      const tooMany = state.reservationSelection.size >= 10;
      body.innerHTML = reserved.length
        ? reserved
            .map((id) => {
              const item = byId(id);
              return ui`<label class="reservation-choice"><input type="checkbox" data-reservation-select="${esc(id)}" ${state.reservationSelection.has(id) ? 'checked' : ''} ${!state.reservationSelection.has(id) && tooMany ? 'disabled' : ''}><span><strong>${esc(item?.title || t('カタログにないセッション'))}</strong><small>${esc(item?.code || id)}${item ? ui` · ${esc(dateLabel(item.date))} ${esc(displayedTime(item))}` : ''} · ${t('AWS Scheduleに予約済み')}</small></span></label>`;
            })
            .join('')
        : t('<p class="hint">AWS Scheduleに予約済みのセッションはありません。</p>');
      $('#reservationIntro').textContent = t(
        'AWS Scheduleの予約を最大10件選んで解除できます。My Planから外す操作とは別です。',
      );
      next.textContent = ui`${t('選択内容を確認')}（${state.reservationSelection.size}/10）`;
      next.hidden = false;
      next.disabled = !state.reservationSelection.size;
      back.textContent = t('閉じる');
    }
    return;
  }
  if (state.reservationStage === 'results') {
    const failures = new Map(
      (state.reservationResults?.failed || []).map((row) => [row.sessionId, row]),
    );
    const unknown = new Set(state.reservationResults?.unknown || []);
    const successful = new Set(state.reservationResults?.successful || []);
    body.innerHTML = selected
      .map((item) => {
        const failure = failures.get(item.id);
        const confirmed =
          state.awsReserved.has(item.id) ||
          (successful.has(item.id) && state.reservationResults?.scheduleConfirmed);
        const label = confirmed
          ? t('予約済み・AWS Scheduleで確認済み')
          : unknown.has(item.id)
            ? t('結果不明・AWS Scheduleで未確認')
            : failure
              ? t('予約できませんでした')
              : successful.has(item.id)
                ? t('AWS応答は成功・Schedule未確認')
                : t('予約済み');
        const statusClass = confirmed ? 'confirmed' : failure ? 'failed' : 'unknown';
        const reason = failure ? reservationFailureLabel(failure.code) : '';
        const conflictNames = (failure?.conflictsWith || [])
          .map((id) => byId(id)?.code || id)
          .join('、');
        return ui`<div class="reservation-result"><strong class="${statusClass}">${esc(label)}</strong><span>${esc(item.title)} · ${esc(item.code)}</span>${reason ? ui`<small>${esc(reason)}${conflictNames ? ui` · ${t('競合')}: ${esc(conflictNames)}` : ''}</small>` : ''}</div>`;
      })
      .join('');
    $('#reservationIntro').textContent = state.reservationResults?.scheduleConfirmed
      ? t('AWS Scheduleを再読込し、予約状態を照合しました。')
      : t('AWS Scheduleを再読込できませんでした。結果を確定できない項目があります。');
    next.hidden = true;
    back.textContent = t('閉じる');
  } else if (state.reservationStage === 'confirm') {
    body.innerHTML = ui`<p class="reservation-warning">${t('次のセッションを1回のリクエストでAWSへ送信します。送信後の個別結果を表示します。')}</p><ul class="action-preview">${selected.map((item) => ui`<li>${esc(item.title)} · ${esc(dateLabel(item.date))} ${esc(displayedTime(item))}${conflicts.get(item.id)?.length ? ui` <span class="conflict-inline">${t('My Plan内で時間重複')}</span>` : ''}</li>`).join('')}</ul><p class="hint">${t('AWSの予約成功はMy Planの候補選択とは別に管理されます。')}</p>`;
    next.textContent = t('この内容でAWSへ送信');
    next.hidden = false;
    back.textContent = t('選択へ戻る');
  } else {
    const tooMany = state.reservationSelection.size >= 10;
    body.innerHTML = candidates.length
      ? candidates
          .map((item) => {
            const reserved = state.awsReserved.has(item.id),
              eligible = item.reservable === true && !reserved;
            const note = reserved
              ? t('AWS Scheduleに予約済み')
              : item.reservable === true
                ? t('予約可能')
                : t('AWS API上で予約対象外');
            return ui`<label class="reservation-choice ${eligible ? '' : 'is-disabled'}"><input type="checkbox" data-reservation-select="${esc(item.id)}" ${state.reservationSelection.has(item.id) ? 'checked' : ''} ${eligible ? '' : 'disabled'} ${!state.reservationSelection.has(item.id) && tooMany ? 'disabled' : ''}><span><strong>${esc(item.title)}</strong><small>${esc(item.code)} · ${esc(dateLabel(item.date))} ${esc(displayedTime(item))} · ${esc(note)}${conflicts.get(item.id)?.length ? ui` · ${t('My Plan内で時間重複')}` : ''}</small></span></label>`;
          })
          .join('')
      : t('<p class="hint">My PlanにAWSセッションがありません。</p>');
    $('#reservationIntro').textContent = t(
      '予約対象を最大10件選んでください。My Plan内の時間重複を確認できますが、AWSが最終判定します。',
    );
    next.textContent = ui`${t('選択内容を確認')}（${state.reservationSelection.size}/10）`;
    next.hidden = false;
    next.disabled = state.reservationSelection.size === 0;
    back.textContent = t('閉じる');
  }
}
function reservationFailureLabel(code) {
  const labels = {
    sessionNotReservable: 'AWS API上で予約対象外',
    scheduleConflict: '予約時間が他の予定と重複',
    alreadyScheduled: 'すでに予約済み',
    sessionFull: '満席',
    insufficientAccess: '予約権限がありません',
    timePassed: 'セッション開始後',
    alreadyFavorited: 'お気に入り登録済み',
    notFavorited: 'お気に入り登録されていません',
    RESERVATIONS_CLOSED_OR_CONFLICT: '予約・解除の受付時間外です。AWSの案内を確認してください。',
    RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
    EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
    SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
    CANCELLATION_FAILED: 'CANCELLATION_FAILED',
    other: 'AWSが予約を受け付けませんでした',
  };
  return t(labels[code] || 'AWSが予約を受け付けませんでした');
}
function favoriteFailureLabel(code) {
  const labels = {
    alreadyFavorited: 'AWSお気に入り登録済み',
    RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
    EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
    SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
    FAVORITES_CLOSED: 'AWSがお気に入りの更新を受け付けていません。時間をおいてください。',
  };
  return t(labels[code] || 'AWSがお気に入りを受け付けませんでした');
}
async function openReservationDialog(mode = 'reserve') {
  if (state.source !== 'live' || !state.localApiAvailable || !state.accountId) return;
  try {
    if (!(await refreshAwsSchedule({ force: true }))) throw new Error('AWS_SCHEDULE_UNAVAILABLE');
    state.reservationSelection = new Set();
    state.reservationResults = null;
    state.reservationMode = mode;
    state.reservationStage = 'select';
    render();
    renderReservationDialog();
    openDialog('reservationDialog');
  } catch {
    notify(t('AWS Scheduleを取得できませんでした。予約前に状態を確認してください。'));
  }
}
async function submitReservationBatch() {
  const ids = [...state.reservationSelection];
  if (!ids.length || ids.length > 10) return;
  const button = $('#reservationNext');
  button.disabled = true;
  state.reservationBusy = true;
  try {
    state.reservationResults = await reserveLiveSessions(ids);
    if (state.reservationResults.scheduleConfirmed) {
      state.awsReserved = new Set([
        ...state.awsReserved,
        ...(state.reservationResults.successful || []),
      ]);
      state.awsScheduleFetchedAt = Date.now();
      state.awsScheduleStatus = 'ready';
    }
    for (const item of state.sessions)
      if (item.uiState)
        item.uiState.attendance = state.awsReserved.has(item.id) ? 'reserved' : 'none';
    state.reservationStage = 'results';
    renderReservationDialog();
    render();
  } catch (error) {
    const messages = {
      RESERVATIONS_CLOSED_OR_CONFLICT:
        '予約受付期間外か、AWS Scheduleが更新されています。Scheduleを更新して確認してください。',
      SESSION_ALREADY_RESERVED:
        'AWS Scheduleに予約済みのセッションがあります。Scheduleを更新してください。',
      SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
      EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
      RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
      RESERVATION_OUTCOME_UNKNOWN:
        '結果を確認できませんでした。再送せず、AWS Scheduleを確認してください。',
      SESSION_NOT_RESERVABLE:
        '予約対象外のセッションが含まれています。AWSカタログを更新してください。',
    };
    notify(t(messages[error.message] || 'AWSへ予約を送信できませんでした。'));
  } finally {
    state.reservationBusy = false;
    button.disabled = false;
  }
}
async function submitReservationCancellations() {
  const ids = [...state.reservationSelection];
  if (!ids.length || ids.length > 10) return;
  const button = $('#reservationNext');
  button.disabled = true;
  state.reservationBusy = true;
  try {
    state.reservationResults = await cancelLiveReservations(ids);
    if (state.reservationResults.scheduleConfirmed) {
      state.awsReserved = new Set(
        state.reservationResults.reserved ||
          [...state.awsReserved].filter((id) => !state.reservationResults.cancelled.includes(id)),
      );
      state.awsScheduleFetchedAt = Date.now();
      state.awsScheduleStatus = 'ready';
    }
    for (const item of state.sessions)
      if (item.uiState)
        item.uiState.attendance = state.awsReserved.has(item.id) ? 'reserved' : 'none';
    state.reservationStage = 'results';
    renderReservationDialog();
    render();
  } catch (error) {
    const messages = {
      SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
      EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
      RESERVATIONS_CLOSED_OR_CONFLICT: '予約・解除の受付時間外です。AWSの案内を確認してください。',
      RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
    };
    notify(t(messages[error.message] || 'AWSへ予約解除を送信できませんでした。'));
  } finally {
    state.reservationBusy = false;
    button.disabled = false;
  }
}
function render() {
  const items = plannerItems(),
    map = conflictMap(items);
  renderKindSwitch();
  renderQuick();
  renderApplied();
  renderTray();
  renderExplore(map);
  renderPlan(items, map);
  if (state.exploreView === 'recommendations') renderRecommendationsPanel(items);
  renderNavigation();
  renderSourceInfo();
  $('#storageWarning').hidden = !state.warning;
  $('#storageWarning').textContent = t(state.warning);
  if ($('#icsExportDialog').open) refreshIcsExportDialog();
}
function renderRecommendationsPanel(items = plannerItems()) {
  const root = $('#recommendations');
  if (state.source !== 'live') {
    root.innerHTML = '';
    return;
  }
  const planKey = items
    .map((item) => `${item.id}:${item.date}:${item.startTime}:${item.endTime}`)
    .join(',');
  const news = state.recommendationNews;
  const cacheKey = [
    recommendationObjectId(state.sessions),
    planKey,
    [...state.plan].sort().join(','),
    [...state.recommendationInterests].sort().join(','),
    recommendationObjectId(news.items),
    news.fetchedAt || '',
    news.refreshing,
    news.error || '',
    getLanguage(),
    new Date().toISOString().slice(0, 10),
  ].join('|');
  if (recommendationMarkupCache.key !== cacheKey || !recommendationMarkupCache.html) {
    recommendationMarkupCache = {
      key: cacheKey,
      html: renderRecommendations(
        [
          ...getRecommendations(state.sessions, { plan: items }),
          ...getNewsRecommendations(state.sessions, news, { plan: items }),
        ],
        new Set(state.plan),
        state.recommendationInterests,
        getPersonalizedRecommendations(state.sessions, {
          interests: state.recommendationInterests,
          plan: items,
        }),
        news,
      ),
    };
  }
  const markupChanged = root.innerHTML !== recommendationMarkupCache.html;
  if (markupChanged) root.innerHTML = recommendationMarkupCache.html;
  if (markupChanged)
    root.querySelectorAll('[data-interest]').forEach((button) =>
      button.addEventListener('click', () => {
        const id = button.dataset.interest;
        state.recommendationInterests = state.recommendationInterests.includes(id)
          ? state.recommendationInterests.filter((value) => value !== id)
          : [...state.recommendationInterests, id];
        try {
          storage.setItem(
            'reinvent-recommendation-interests',
            JSON.stringify(state.recommendationInterests),
          );
        } catch {}
        renderRecommendationsPanel();
      }),
    );
}
function renderSearch() {
  renderKindSwitch();
  renderQuick();
  renderApplied();
  renderTray();
  renderExplore(conflictMap(plannerItems()));
  renderNavigation();
}
function commitSearch({ push = true } = {}) {
  clearTimeout(searchTimer);
  displayLimit = 40;
  if (state.exploreKind === 'sideEvents') state.sideEventFilters = structuredClone(state.filters);
  else state.sessionFilters = structuredClone(state.filters);
  syncURL(push);
  renderSearch();
}
function resetFilters(includeQuery = false) {
  const query = includeQuery ? '' : state.filters.query;
  state.filters =
    state.exploreKind === 'sideEvents'
      ? sideEventFiltersFrom({ query })
      : { ...defaultFilters(), levelDefaultSuppressed: true, query };
  $('#q').value = state.filters.query;
  commitSearch();
}
function setExploreKind(kind) {
  if (state.exploreKind === 'sideEvents') state.sideEventFilters = structuredClone(state.filters);
  else state.sessionFilters = structuredClone(state.filters);
  state.exploreView = 'sessions';
  state.exploreKind = kind;
  state.filters = structuredClone(
    kind === 'sideEvents' ? state.sideEventFilters : state.sessionFilters,
  );
  $('#q').value = state.filters.query;
  buildFacets();
  commitSearch();
}
function setExploreView(view) {
  state.exploreView = view;
  renderKindSwitch();
  if (view === 'recommendations') renderRecommendationsPanel();
}
function renderCurrentDetail() {
  const item = byId(state.detailId);
  if (item) {
    $('#detailContent').innerHTML = renderDetail(
      item,
      new Set(state.plan),
      conflictMap(plannerItems()),
      state.detailTranslations.get(item.id) || { status: 'idle', text: '' },
      state.source === 'live' && state.localApiAvailable && !!state.accountId,
      state.favoritePending.has(item.id),
      state.favoriteUnknown.has(item.id),
      state.showJapanTime,
    );
    const button = $('#detailContent [data-translate-detail]');
    button?.addEventListener('click', () => void translateDetail(button.dataset.translateDetail));
  }
}
function savePlan() {
  const key = currentPlanKey();
  state.warning = key
    ? writePlan(storage, state.plan, key)
    : t('サインイン後にアカウント別のLocal Planへ保存できます。');
  render();
  if (state.detailId && byId(state.detailId)) renderCurrentDetail();
  if ($('#compareDialog').open)
    $('#compareContent').innerHTML = renderComparison(
      state.comparison.map(byId).filter(Boolean),
      new Set(state.plan),
      conflictMap(plannerItems()),
      state.showJapanTime,
    );
}
function setPlan(id, included) {
  const item = byId(id);
  if (!item) throw new Error('Unknown session');
  if (item.itemType === 'personalTime') throw new Error('AWS personal time is read-only');
  state.plan = included ? [...new Set([...state.plan, id])] : state.plan.filter((x) => x !== id);
  savePlan();
  notify(
    included ? t('My Planに追加しました（予約ではありません）') : t('My Planから削除しました'),
  );
}
function openPersonalTime(item = null) {
  editingPersonalTimeId = item?.personalTimeId || '';
  $('#personalTimeHeading').textContent = t(
    editingPersonalTimeId ? 'AWS個人予定を編集' : 'AWS個人予定を追加',
  );
  $('#personalTimeDelete').hidden = !editingPersonalTimeId;
  $('#personalTimeError').hidden = true;
  $('#personalTimeForm').reset();
  $('#personalTimeTitle').value = item?.title || '';
  $('#personalTimeDescription').value = item?.abstract || '';
  $('#personalTimeLocation').value = item?.venue || '';
  $('#personalTimeDate').value =
    item?.date ||
    (['all', 'unknown'].includes(state.planDate) ? venueToday() : state.planDate || venueToday());
  $('#personalTimeStart').value = item?.startTime || '12:00';
  $('#personalTimeEnd').value = item?.endTime || '13:00';
  openDialog('personalTimeDialog');
}
function openPersonalTimeDelete(personalTimeId) {
  const item = state.awsPersonalTimes.find((value) => value.personalTimeId === personalTimeId);
  if (!item) return;
  editingPersonalTimeId = personalTimeId;
  $('#personalTimeDeleteName').textContent = item.title;
  openDialog('personalTimeDeleteDialog');
}
function personalTimeInput(action) {
  const date = $('#personalTimeDate').value,
    start = venueLocalDateTimeToUtc(date, $('#personalTimeStart').value),
    end = venueLocalDateTimeToUtc(date, $('#personalTimeEnd').value);
  if (!start || !end) return null;
  const duration = (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 60000;
  if (duration <= 0 || duration % 5 !== 0) return null;
  return {
    action,
    personalTimeId: editingPersonalTimeId,
    title: $('#personalTimeTitle').value.trim(),
    description: $('#personalTimeDescription').value.trim(),
    startDateTime: start,
    endDateTime: end,
    location: $('#personalTimeLocation').value.trim(),
  };
}
async function submitPersonalTime(event) {
  event.preventDefault();
  const payload = personalTimeInput(editingPersonalTimeId ? 'update' : 'create');
  if (!payload) {
    $('#personalTimeError').textContent = t(
      '開始・終了時刻は会場時間で入力し、5分単位の正しい範囲を指定してください。',
    );
    $('#personalTimeError').hidden = false;
    return;
  }
  const button = $('#personalTimeSave');
  button.disabled = true;
  try {
    const result = await saveLivePersonalTime(payload);
    if (!result.confirmed) {
      await refreshAwsSchedule({ force: true });
      notify(t('AWS Scheduleで結果を確認できませんでした。再送せず、Scheduleを確認してください。'));
      return;
    }
    $('#personalTimeDialog').close();
    await refreshAwsSchedule({ force: true });
    notify(t(editingPersonalTimeId ? 'AWS個人予定を更新しました' : 'AWS個人予定を追加しました'));
  } catch (error) {
    const message = {
      SIGN_IN_REQUIRED: 'AWSへサインインしてください。',
      EVENT_REGISTRATION_REQUIRED: 'AWS re:Inventへの登録が必要です。',
      RATE_LIMITED: 'AWS側で一時的な上限に達しました。時間をおいてください。',
      PERSONAL_TIME_FIELDS_INVALID: 'タイトル・説明・場所の長さを確認してください。',
      PERSONAL_TIME_DATETIME_INVALID: '日付と時刻を確認してください。',
      PERSONAL_TIME_INTERVAL_INVALID: '終了は開始より後の5分単位にしてください。',
      AWS_OPERATION_CLOSED: 'AWS個人予定の変更は現在受け付けられていません。',
      PERSONAL_TIME_REJECTED: 'AWSが個人予定を受け付けませんでした。',
    };
    $('#personalTimeError').textContent = t(
      message[error.message] || 'AWS個人予定を保存できませんでした。',
    );
    $('#personalTimeError').hidden = false;
  } finally {
    button.disabled = false;
  }
}
async function deletePersonalTime() {
  const id = editingPersonalTimeId;
  if (!id) return;
  const button = $('#confirmPersonalTimeDelete');
  button.disabled = true;
  try {
    const result = await saveLivePersonalTime({ action: 'delete', personalTimeId: id });
    $('#personalTimeDeleteDialog').close();
    if (!result.confirmed) {
      await refreshAwsSchedule({ force: true });
      notify(
        t('AWS Scheduleで削除を確認できませんでした。再実行せず、Scheduleを確認してください。'),
      );
      return;
    }
    if ($('#personalTimeDialog').open) $('#personalTimeDialog').close();
    await refreshAwsSchedule({ force: true });
    notify(t('AWS個人予定を削除しました'));
  } catch (error) {
    notify(
      t(
        error.message === 'SIGN_IN_REQUIRED'
          ? 'AWSへサインインしてください。'
          : 'AWS個人予定を削除できませんでした。',
      ),
    );
  } finally {
    button.disabled = false;
  }
}
function openDialog(id) {
  const d = $('#' + id);
  if (!d.open) d.showModal();
}
function openDetail(id) {
  const s = byId(id);
  if (!s) return;
  state.detailId = id;
  renderCurrentDetail();
  openDialog('detailDialog');
}
async function translateDetail(id) {
  const item = byId(id);
  if (!item?.abstract || state.detailId !== id) return;
  state.detailTranslations.set(id, { status: 'loading', text: '' });
  renderCurrentDetail();
  try {
    const text = await translateSessionToJapanese(item.title, item.abstract);
    state.detailTranslations.set(id, { status: 'ready', text });
  } catch {
    state.detailTranslations.set(id, { status: 'error', text: '' });
  }
  if (state.detailId === id) renderCurrentDetail();
}
function toggleCompare(id) {
  if (!byId(id)) return;
  if (state.compare.includes(id)) state.compare = state.compare.filter((x) => x !== id);
  else if (state.compare.length < 3) state.compare.push(id);
  else {
    notify(t('比較は同時に3件までです'));
    return;
  }
  render();
}
function openCompare(ids) {
  state.comparison = [...new Set(ids)].filter((id) => byId(id)).slice(0, 3);
  if (state.comparison.length < 2) return;
  $('#compareContent').innerHTML = renderComparison(
    state.comparison.map(byId),
    new Set(state.plan),
    conflictMap(plannerItems()),
    state.showJapanTime,
  );
  openDialog('compareDialog');
}
function findGap(date, from, to) {
  state.exploreKind = 'sessions';
  state.filters = {
    ...defaultFilters(),
    date: [date],
    from,
    to: to === '24:00' ? '' : to,
    fit: 'contained',
  };
  state.sessionFilters = structuredClone(state.filters);
  $('#q').value = '';
  commitSearch();
  changeActive('explore', { restore: false });
  notify(t('空き時間の枠内に収まるセッションを表示しています'));
}
function buildFacets() {
  const source = state.exploreKind === 'sideEvents' ? state.sideEvents : state.sessions;
  for (const key of MULTI_KEYS) {
    if (key === 'reservability') {
      facets[key] = [
        ...new Set(
          source
            .filter((s) => s.dataSource === 'aws' && s.itemType === 'session')
            .map((s) =>
              s.reservable === true ? 'yes' : s.reservable === false ? 'no' : 'unknown',
            ),
        ),
      ].sort();
      continue;
    }
    const field = { topic: 'topics', service: 'services', speaker: 'speakers' }[key] || key;
    facets[key] = [
      ...new Set(
        source
          .flatMap((s) =>
            key === 'venue' ? [s.venue] : Array.isArray(s[field]) ? s[field] : [s[field]],
          )
          .filter(Boolean),
      ),
    ].sort();
  }
}
function facetValueLabel(key, value) {
  if (key === 'date') return dateLabel(value);
  if (key === 'reservability')
    return t(
      { yes: 'AWS予約対象', no: '予約対象外', unknown: '予約可否不明' }[value] || '予約可否不明',
    );
  return value;
}
function renderFacetOptions(key, query = '') {
  const selected = state.draft[key],
    all = [...new Set([...selected, ...facets[key]])];
  const values = all.filter((v) => v.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const visible = values.slice(0, 100);
  return (
    visible
      .map(
        (value) =>
          ui`<label class="facet-option"><input type="checkbox" data-facet="${key}" value="${esc(value)}" ${selected.includes(value) ? 'checked' : ''}><span>${esc(facetValueLabel(key, value))}</span></label>`,
      )
      .join('') +
    (values.length > 100
      ? t('<p class="hint">先頭100件を表示。検索して絞り込んでください。</p>')
      : '') +
    (!values.length ? t('<p class="facet-empty">該当する値はありません。</p>') : '')
  );
}
function openFilters({ preserveDraft = false } = {}) {
  const draftFrom = $('#from').value,
    draftTo = $('#to').value,
    draftFit = $('#fitContained').checked;
  if (!preserveDraft || !state.draft) state.draft = structuredClone(state.filters);
  const sideMode = state.exploreKind === 'sideEvents';
  $('.time-facet').hidden = sideMode;
  const renderFacet = (key) => {
    const label = sideMode && key === 'topic' ? t('カテゴリ') : t(FACET_LABELS[key]);
    return ui`<fieldset class="facet-group"><legend>${label}</legend>${facets[key]?.length > 12 ? ui`<input class="facet-search" type="search" data-facet-search="${key}" aria-label="${label}の候補を検索" placeholder="${label}を検索">` : ''}<div class="facet-options" id="facet-${key}">${renderFacetOptions(key)}</div></fieldset>`;
  };
  $('#dateFacet').innerHTML = renderFacet('date');
  $('#facetFields').innerHTML = (
    sideMode
      ? ['topic', 'venue']
      : ['sessionType', 'level', 'track', 'topic', 'service', 'venue', 'speaker']
  )
    .map(renderFacet)
    .join('');
  if (!sideMode) {
    const walkupFilter = ui`<fieldset class="facet-group walkup-filter"><legend>${t('参加方法')}</legend><label class="facet-option"><input id="walkUpOnlyFilter" type="checkbox" ${state.draft.walkUpOnly ? 'checked' : ''}><span>${t('Walk-up Only（当日参加のみ）')}</span></label><p class="hint">${t('事前予約なしで現地参加するセッションに絞り込みます。')}</p></fieldset>`;
    const reservabilityFilter = state.sessions.some(
      (s) => s.dataSource === 'aws' && s.itemType === 'session',
    )
      ? `${renderFacet('reservability')}${t('<p class="hint">AWSカタログの予約対象区分です。空席状況とは別で、実際の予約はAWS側が判定します。</p>')}`
      : '';
    $('#facetFields').innerHTML = walkupFilter + reservabilityFilter + $('#facetFields').innerHTML;
  }
  $('#from').value = preserveDraft ? draftFrom : state.filters.from;
  $('#to').value = preserveDraft ? draftTo : state.filters.to;
  $('#fitContained').checked = preserveDraft ? draftFit : state.filters.fit === 'contained';
  if (!preserveDraft) $('#timeError').hidden = true;
  openDialog('filterDialog');
}
function applySessions(sessions) {
  state.sessions = sessions;
  for (const item of sessions)
    if (item.uiState) {
      item.uiState.attendance = state.awsReserved.has(item.id) ? 'reserved' : 'none';
      item.uiState.favorite = state.awsFavorites.has(item.id);
    }
  const all = [...sessions, ...state.sideEvents, ...state.awsPersonalTimes];
  state.byId = new Map(all.map((s) => [s.id, s]));
  state.catalog = createCatalog(sessions);
  state.sideEventCatalog = createCatalog(state.sideEvents);
  buildFacets();
}
async function refreshAwsSchedule({ force = false } = {}) {
  if (state.source !== 'live' || !state.localApiAvailable || !state.accountId) return false;
  if (scheduleRefreshPromise) return scheduleRefreshPromise;
  if (!force && state.awsScheduleFetchedAt && Date.now() - state.awsScheduleFetchedAt < 60000)
    return true;
  const accountId = state.accountId;
  state.awsScheduleStatus = 'loading';
  render();
  scheduleRefreshPromise = (async () => {
    try {
      const response = await fetchLiveSchedule(),
        reserved = response.schedule?.reserved,
        favorites = response.schedule?.favorites,
        personalTime = response.schedule?.personalTime;
      if (!Array.isArray(reserved) || !Array.isArray(favorites) || !Array.isArray(personalTime))
        throw new Error('AWS_RESPONSE_INVALID');
      if (state.source !== 'live' || state.accountId !== accountId) return false;
      state.awsReserved = new Set(reserved.filter((id) => typeof id === 'string'));
      state.awsFavorites = new Set(favorites.filter((id) => typeof id === 'string'));
      state.favoriteUnknown.clear();
      state.awsPersonalTimes = adaptAwsPersonalTimes(personalTime);
      state.awsScheduleFetchedAt = Date.now();
      state.awsScheduleStatus = 'ready';
      for (const item of state.sessions)
        if (item.uiState) {
          item.uiState.attendance = state.awsReserved.has(item.id) ? 'reserved' : 'none';
          item.uiState.favorite = state.awsFavorites.has(item.id);
        }
      applySessions(state.sessions);
      render();
      return true;
    } catch {
      if (state.source === 'live' && state.accountId === accountId) {
        state.awsScheduleStatus = 'error';
        render();
      }
      return false;
    } finally {
      scheduleRefreshPromise = null;
    }
  })();
  return scheduleRefreshPromise;
}
async function refreshRecommendationNews() {
  if (state.source !== 'live' || !state.localApiAvailable) return;
  try {
    const response = await fetchRecommendationNews();
    state.recommendationNews = response;
    clearTimeout(newsPollTimer);
    const delay = response.refreshing
      ? 1800
      : response.error
        ? 30 * 60 * 1000
        : response.fetchedAt
          ? Math.max(60_000, 6 * 60 * 60 * 1000 - (Date.now() - response.fetchedAt * 1000))
          : null;
    if (delay !== null) newsPollTimer = setTimeout(refreshRecommendationNews, delay);
    render();
  } catch {}
}
function scheduleLivePoll(seq) {
  clearTimeout(livePollTimer);
  livePollTimer = setTimeout(async () => {
    if (seq !== sequence || state.source !== 'live') return;
    try {
      const snapshot = await fetchLiveCatalog();
      if (seq !== sequence) return;
      state.catalogMeta = snapshot;
      applySessions(snapshot.sessions);
      state.status =
        snapshot.error && !snapshot.sessions.length
          ? 'error'
          : snapshot.refreshing && !snapshot.sessions.length
            ? 'loading'
            : 'ready';
      render();
      if (snapshot.refreshing || (!snapshot.complete && !snapshot.error)) scheduleLivePoll(seq);
    } catch (error) {
      if (seq !== sequence) return;
      state.status = error.status === 401 ? 'unauthenticated' : 'error';
      render();
    }
  }, 700);
}
async function load() {
  controller?.abort();
  clearTimeout(livePollTimer);
  clearTimeout(newsPollTimer);
  const activeController = new AbortController();
  controller = activeController;
  const seq = ++sequence;
  state.status = 'loading';
  state.catalogMeta = null;
  render();
  const timer = setTimeout(() => activeController.abort(), 15000);
  try {
    if (state.source === 'demo') {
      const sessions = await sessionRepository.listSessions({ signal: activeController.signal });
      if (seq !== sequence) return;
      state.catalogMeta = {
        complete: true,
        refreshing: false,
        pages: 1,
        totalCount: sessions.length,
        fetchedAt: null,
      };
      applySessions(sessions);
      state.status = 'ready';
      render();
    } else {
      void refreshRecommendationNews();
      const snapshot = await fetchLiveCatalog({ signal: activeController.signal });
      if (seq !== sequence) return;
      state.catalogMeta = snapshot;
      applySessions(snapshot.sessions);
      state.status =
        snapshot.error && !snapshot.sessions.length
          ? 'error'
          : snapshot.refreshing && !snapshot.sessions.length
            ? 'loading'
            : 'ready';
      render();
      if (snapshot.refreshing || (!snapshot.complete && !snapshot.error)) scheduleLivePoll(seq);
    }
  } catch (error) {
    if (seq !== sequence) return;
    state.status = state.source === 'live' && error.status === 401 ? 'unauthenticated' : 'error';
    render();
  } finally {
    clearTimeout(timer);
  }
}
function switchSource(source, accountId = state.accountId) {
  if (source !== runtimeMode) return;
  const oldKey = currentPlanKey();
  state.source = source;
  if (source !== 'live') state.exploreView = 'sessions';
  state.accountId = source === 'live' ? accountId : '';
  state.awsReserved = new Set();
  state.awsFavorites = new Set();
  state.favoriteUnknown.clear();
  state.awsPersonalTimes = [];
  state.awsScheduleStatus = 'idle';
  state.awsScheduleFetchedAt = 0;
  const nextKey = currentPlanKey();
  if (oldKey !== nextKey) {
    const plan = nextKey ? readPlan(storage, nextKey) : { ids: [], warning: '' };
    state.plan = plan.ids;
    state.warning = plan.warning;
  }
  state.planDate = '';
  load();
}
async function initialize() {
  try {
    state.sideEvents = await sideEventRepository.listSideEvents();
  } catch {}
  applySessions([]);
  if (runtimeMode === 'live') {
    state.source = 'live';
    const guestPlanKey = livePlanKey('guest');
    const rememberedAccountId = rememberedLiveAccountId();
    const fallbackPlan = readPlan(storage, livePlanKey(rememberedAccountId || 'guest'));
    const guestPlan = rememberedAccountId
      ? readPlan(storage, guestPlanKey)
      : { ids: [], warning: '' };
    state.plan = [...new Set([...fallbackPlan.ids, ...guestPlan.ids])];
    state.warning = fallbackPlan.warning || guestPlan.warning;
    try {
      const session = await localSessionStatus();
      state.localApiAvailable = true;
      if (session.authenticated && session.accountId) {
        state.accountId = session.accountId;
        rememberLiveAccountId(state.accountId);
        let plan = readPlan(storage, currentPlanKey());
        const guestPlan = readPlan(storage, guestPlanKey);
        if (guestPlan.ids.length) {
          const ids = [...new Set([...plan.ids, ...guestPlan.ids])];
          const warning = writePlan(storage, ids, currentPlanKey());
          plan = { ids, warning: warning || plan.warning || guestPlan.warning };
          if (!warning) storage.removeItem(guestPlanKey);
        }
        state.plan = plan.ids;
        state.warning = plan.warning;
        void refreshAwsSchedule();
      } else {
        const localPlan = readPlan(storage, currentPlanKey());
        state.plan = [...new Set([...state.plan, ...localPlan.ids])];
        state.warning ||= localPlan.warning;
      }
    } catch {
      state.localApiAvailable = false;
    }
  } else {
    state.source = 'demo';
    state.plan = saved.ids;
    state.warning = saved.warning;
  }
  syncURL(false);
  render();
  load();
}
async function beginSignIn() {
  try {
    const url = await startBuilderIdSignIn();
    window.location.assign(url);
  } catch {
    notify(t('サインインを開始できませんでした。Local serverの状態を確認してください。'));
  }
}
function clearSignedInAccount() {
  controller?.abort();
  sequence++;
  clearTimeout(livePollTimer);
  clearTimeout(newsPollTimer);
  state.accountId = '';
  state.plan = [];
  state.warning = '';
  state.awsReserved = new Set();
  state.awsFavorites = new Set();
  state.favoriteUnknown.clear();
  state.awsPersonalTimes = [];
  state.awsScheduleStatus = 'idle';
  state.awsScheduleFetchedAt = 0;
  state.catalogMeta = null;
  state.sessions = [];
  state.catalog = createCatalog([]);
  state.byId = new Map(state.sideEvents.map((item) => [item.id, item]));
  state.status = 'unauthenticated';
  state.planDate = '';
  state.reservationSelection = new Set();
  state.reservationResults = null;
  state.reservationStage = 'select';
}
function openAwsSignOut() {
  openDialog('awsSignOutDialog');
}
async function signOutAppOnly() {
  const button = $('#signOutAppOnly');
  button.disabled = true;
  try {
    await signOutAws();
    clearSignedInAccount();
    $('#awsSignOutDialog').close();
    render();
    notify(
      t('このアプリからサインアウトしました。Builder IDのブラウザーセッションは維持しています。'),
    );
  } catch {
    notify(
      t('AWSからサインアウトできませんでした。KeychainとLocal serverの状態を確認してください。'),
    );
  } finally {
    button.disabled = false;
  }
}
async function switchBuilderId() {
  const button = $('#switchBuilderId');
  button.disabled = true;
  try {
    const url = await signOutBuilderId();
    $('#awsSignOutDialog').close();
    if (typeof url === 'string') window.location.assign(url);
  } catch {
    notify(
      t('AWSからサインアウトできませんでした。KeychainとLocal serverの状態を確認してください。'),
    );
  } finally {
    button.disabled = false;
  }
}
async function refreshLive() {
  try {
    await Promise.all([requestCatalogRefresh(), refreshAwsSchedule({ force: true })]);
    state.status = state.sessions.length ? 'ready' : 'loading';
    render();
    scheduleLivePoll(sequence);
  } catch (error) {
    notify(
      error.message === 'SIGN_IN_REQUIRED'
        ? t('AWSへサインインしてください。')
        : t('AWSカタログを更新できませんでした。'),
    );
  }
}
$('#q').value = state.filters.query;
$('#languageSwitch').addEventListener('change', () => {
  setLanguage($('#languageSwitch').value, storage);
  applyStaticLanguage();
  render();
  if (state.detailId && byId(state.detailId)) renderCurrentDetail();
  if ($('#compareDialog').open)
    $('#compareContent').innerHTML = renderComparison(
      state.comparison.map(byId).filter(Boolean),
      new Set(state.plan),
      conflictMap(plannerItems()),
      state.showJapanTime,
    );
  if ($('#filterDialog').open) openFilters({ preserveDraft: true });
  if ($('#reservationDialog').open) renderReservationDialog();
  if ($('#favoriteDialog').open) renderFavoriteDialog();
  if ($('#icsExportDialog').open) refreshIcsExportDialog();
  $('#toast').hidden = true;
});
$('#showSessionItems').addEventListener('click', () => setExploreKind('sessions'));
$('#showSideEvents').addEventListener('click', () => setExploreKind('sideEvents'));
$('#showAwsFavorites').addEventListener('click', () => setExploreKind('favorites'));
$('#showRecommendations').addEventListener('click', () => setExploreView('recommendations'));
$('#addPersonalTime').addEventListener('click', () => openPersonalTime());
$('#personalTimeForm').addEventListener('submit', submitPersonalTime);
$('#personalTimeDelete').addEventListener('click', () =>
  openPersonalTimeDelete(editingPersonalTimeId),
);
$('#confirmPersonalTimeDelete').addEventListener('click', deletePersonalTime);
$('#demoMode').addEventListener('click', () => switchSource('demo'));
$('#liveMode').addEventListener('click', () => switchSource('live'));
$('#signIn').addEventListener('click', beginSignIn);
$('#refreshLive').addEventListener('click', refreshLive);
$('#signOut').addEventListener('click', openAwsSignOut);
$('#signOutAppOnly').addEventListener('click', signOutAppOnly);
$('#switchBuilderId').addEventListener('click', switchBuilderId);
$('#reservePlanned').addEventListener('click', openReservationDialog);
$('#favoritePlanned').addEventListener('click', openFavoriteDialog);
$('#manageReservations').addEventListener('click', () => openReservationDialog('cancel'));
$('#refreshSchedule').addEventListener('click', () => void refreshAwsSchedule({ force: true }));
$('#reservationNext').addEventListener('click', () => {
  if (state.reservationBusy) return;
  if (state.reservationStage === 'select') {
    if (state.reservationSelection.size) {
      state.reservationStage = 'confirm';
      renderReservationDialog();
    }
  } else if (state.reservationStage === 'confirm') {
    if (state.reservationMode === 'cancel') submitReservationCancellations();
    else submitReservationBatch();
  }
});
$('#reservationBack').addEventListener('click', (event) => {
  if (state.reservationStage === 'confirm') {
    event.preventDefault();
    state.reservationStage = 'select';
    renderReservationDialog();
  }
});
$('#favoriteNext').addEventListener('click', () => {
  if (state.favoriteBusy) return;
  if (state.favoriteStage === 'select') {
    if (state.favoriteSelection.size) {
      state.favoriteStage = 'confirm';
      renderFavoriteDialog();
    }
  } else if (state.favoriteStage === 'confirm') {
    submitFavoriteBatch();
  }
});
$('#favoriteBack').addEventListener('click', (event) => {
  if (state.favoriteStage === 'confirm') {
    event.preventDefault();
    state.favoriteStage = 'select';
    renderFavoriteDialog();
  } else {
    $('#favoriteDialog').close();
  }
});
document.addEventListener('change', (event) => {
  const favoriteId = event.target.dataset?.favoriteSelect;
  if (favoriteId) {
    if (event.target.checked && state.favoriteSelection.size >= 10) {
      event.target.checked = false;
      return;
    }
    state.favoriteSelection = event.target.checked
      ? new Set([...state.favoriteSelection, favoriteId])
      : new Set([...state.favoriteSelection].filter((value) => value !== favoriteId));
    renderFavoriteDialog();
    return;
  }
  const reservationId = event.target.dataset?.reservationSelect;
  if (reservationId) {
    if (event.target.checked && state.reservationSelection.size >= 10) {
      event.target.checked = false;
      return;
    }
    state.reservationSelection = event.target.checked
      ? new Set([...state.reservationSelection, reservationId])
      : new Set([...state.reservationSelection].filter((value) => value !== reservationId));
    renderReservationDialog();
    return;
  }
});
$('#q').addEventListener('input', () => {
  state.filters.query = $('#q').value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => commitSearch({ push: false }), 90);
});
$('#clearSearch').addEventListener('click', () => {
  state.filters.query = '';
  $('#q').value = '';
  commitSearch();
  $('#q').focus();
});
$('#openFilters').addEventListener('click', openFilters);
$('#filterForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const from = $('#from').value,
    to = $('#to').value;
  if (from && to && minutes(from) >= minutes(to)) {
    $('#timeError').hidden = false;
    $('#to').focus();
    return;
  }
  state.filters = {
    ...state.draft,
    query: state.filters.query,
    from,
    to,
    fit: $('#fitContained').checked ? 'contained' : 'overlap',
    walkUpOnly: $('#walkUpOnlyFilter')?.checked === true,
  };
  commitSearch();
  $('#filterDialog').close();
});
$('#resetFilters').addEventListener('click', () => {
  resetFilters();
  openFilters();
});
for (const [id, value] of [
  ['showSessions', 'explore'],
  ['showPlan', 'plan'],
  ['mobileExplore', 'explore'],
  ['mobilePlan', 'plan'],
])
  $('#' + id).addEventListener('click', () => changeActive(value));
for (const [id, value] of [
  ['cardView', 'card'],
  ['compactView', 'compact'],
])
  $('#' + id).addEventListener('click', () => {
    state.view = value;
    try {
      storage.setItem('reinvent-view', value);
    } catch {}
    commitSearch();
  });
$('#sort').addEventListener('change', () => {
  state.sort = $('#sort').value;
  commitSearch();
});
$('#planDate').addEventListener('change', () => {
  state.planDate = $('#planDate').value;
  render();
  const scroll = $('#planContent').querySelector?.('.timeline-scroll');
  if (scroll) scroll.scrollTop = 0;
});
$('#showJapanTime').addEventListener('change', () => {
  state.showJapanTime = $('#showJapanTime').checked;
  try {
    storage.setItem('reinvent-show-japan-time', state.showJapanTime ? '1' : '0');
  } catch {}
  render();
  if (state.detailId && byId(state.detailId)) renderCurrentDetail();
  if ($('#compareDialog').open)
    $('#compareContent').innerHTML = renderComparison(
      state.comparison.map(byId).filter(Boolean),
      new Set(state.plan),
      conflictMap(plannerItems()),
      state.showJapanTime,
    );
  if ($('#reservationDialog').open) renderReservationDialog();
  if ($('#favoriteDialog').open) renderFavoriteDialog();
  if ($('#icsExportDialog').open) refreshIcsExportDialog();
});
$('#todayPlan').addEventListener('click', () => {
  state.planDate = venueToday();
  render();
});
for (const [id, value] of [
  ['listView', 'list'],
  ['timelineView', 'timeline'],
])
  $('#' + id).addEventListener('click', () => {
    state.planView = value;
    if (value === 'timeline' && state.planDate === 'all')
      state.planDate =
        chosen().find((s) => s.date)?.date || state.sessions.find((s) => s.date)?.date || '';
    render();
  });
function refreshIcsExportDialog() {
  const selectedIds = state.icsSelection;
  state.icsCandidates = calendarExportItems();
  state.icsSelection = new Set(
    [...selectedIds].filter((id) => state.icsCandidates.some((item) => item.id === id)),
  );
  const query = state.icsSearch.trim().toLocaleLowerCase(),
    visible = state.icsCandidates.filter((item) =>
      [item.title, item.code, item.calendarStatus, item.calendarAvailability, 'Walk-up Only']
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    ),
    exportable = state.icsCandidates.filter(validInterval),
    selectedCount = [...state.icsSelection].filter((id) =>
      exportable.some((item) => item.id === id),
    ).length;
  $('#icsExportCount').textContent =
    getLanguage() === 'en'
      ? `${selectedCount} selected · ${exportable.length} exportable · ${state.icsCandidates.length - exportable.length} without confirmed time`
      : `${selectedCount}件選択中 · 出力可能 ${exportable.length}件 · 日時未確定 ${state.icsCandidates.length - exportable.length}件`;
  $('#confirmIcsExport').disabled = selectedCount === 0;
  $('#selectReservedIcs').disabled =
    state.source !== 'live' ||
    state.awsScheduleStatus !== 'ready' ||
    !exportable.some((item) => item.calendarReserved);
  $('#selectWalkupIcs').disabled = !exportable.some(
    (item) => item.uiState?.availability === 'walkUp',
  );
  $('#icsExportList').innerHTML = visible.length
    ? visible
        .map((item) => {
          const canExport = validInterval(item),
            checked = state.icsSelection.has(item.id),
            dateTime = canExport
              ? `${dateLabel(item.date)} ${displayedTime(item, item.date)}`
              : t('日時未定 · ICS出力対象外');
          return ui`<label class="ics-export-option ${canExport ? '' : 'is-disabled'}"><input type="checkbox" data-ics-select="${esc(item.id)}" ${checked ? 'checked' : ''} ${canExport ? '' : 'disabled'}><span><strong>${esc(item.title)}</strong><small>${esc(item.code || '')}${item.code ? ' · ' : ''}${esc(dateTime)}</small><small>${esc(item.calendarStatus)}${item.calendarAvailability ? ui` · <span class="walkup-label">${esc(item.calendarAvailability)}</span>` : ''}</small></span></label>`;
        })
        .join('')
    : `<p class="ics-export-empty">${t('検索に一致する予定はありません。')}</p>`;
}
function openIcsExportDialog() {
  state.icsSearch = '';
  $('#icsExportSearch').value = '';
  state.icsCandidates = calendarExportItems();
  state.icsSelection = new Set(state.icsCandidates.filter(validInterval).map((item) => item.id));
  refreshIcsExportDialog();
  openDialog('icsExportDialog');
}
function downloadPlanIcs() {
  const selected = state.icsCandidates.filter(
    (item) => state.icsSelection.has(item.id) && validInterval(item),
  );
  const result = createCalendarIcs(selected);
  if (!result.exported) {
    notify(t('日時が確定した候補がないため、ICSを書き出せません。'));
    return;
  }
  const url = URL.createObjectURL(
    new Blob([result.content], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reinvent2026-plan.ics';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $('#icsExportDialog').close();
  notify(ui`${result.exported}件を書き出しました`);
}
$('#exportCalendar').addEventListener('click', openIcsExportDialog);
$('#icsExportSearch').addEventListener('input', () => {
  state.icsSearch = $('#icsExportSearch').value;
  refreshIcsExportDialog();
});
$('#selectReservedIcs').addEventListener('click', () => {
  state.icsSelection = new Set(
    state.icsCandidates
      .filter((item) => item.calendarReserved && validInterval(item))
      .map((item) => item.id),
  );
  refreshIcsExportDialog();
});
$('#selectWalkupIcs').addEventListener('click', () => {
  state.icsSelection = new Set(
    state.icsCandidates
      .filter((item) => item.uiState?.availability === 'walkUp' && validInterval(item))
      .map((item) => item.id),
  );
  refreshIcsExportDialog();
});
$('#selectAllIcs').addEventListener('click', () => {
  state.icsSelection = new Set(state.icsCandidates.filter(validInterval).map((item) => item.id));
  refreshIcsExportDialog();
});
$('#clearIcsSelection').addEventListener('click', () => {
  state.icsSelection.clear();
  refreshIcsExportDialog();
});
$('#confirmIcsExport').addEventListener('click', downloadPlanIcs);
$('#icsExportList').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-ics-select]');
  if (!checkbox) return;
  if (checkbox.checked) state.icsSelection.add(checkbox.dataset.icsSelect);
  else state.icsSelection.delete(checkbox.dataset.icsSelect);
  refreshIcsExportDialog();
});
$('#clearPlan').addEventListener('click', () => openDialog('clearDialog'));
$('#confirmClear').addEventListener('click', () => {
  state.plan = [];
  savePlan();
  $('#clearDialog').close();
  notify(t('My Planをすべて削除しました'));
});
$('#detailDialog').addEventListener('close', () => (state.detailId = null));
for (const id of [
  'filterDialog',
  'detailDialog',
  'compareDialog',
  'clearDialog',
  'reservationDialog',
  'favoriteDialog',
  'icsExportDialog',
])
  $('#' + id).addEventListener('click', (event) => {
    if (event.target === $('#' + id)) {
      const b = event.target.getBoundingClientRect();
      if (
        event.clientX < b.left ||
        event.clientX > b.right ||
        event.clientY < b.top ||
        event.clientY > b.bottom
      )
        event.target.close();
    }
  });
document.addEventListener('input', (event) => {
  const key = event.target.dataset?.facetSearch;
  if (key && state.draft)
    $('#facet-' + key).innerHTML = renderFacetOptions(key, event.target.value);
});
document.addEventListener('change', (event) => {
  const key = event.target.dataset?.facet;
  if (!key || !state.draft) return;
  const value = event.target.value;
  state.draft[key] = event.target.checked
    ? [...new Set([...state.draft[key], value])]
    : state.draft[key].filter((x) => x !== value);
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) {
    if (button.disabled) return;
    const d = button.dataset;
    if (d.copyCode) {
      event.preventDefault();
      event.stopPropagation();
      void copySessionCode(d.copyCode, button);
      return;
    }
    if (d.close) {
      $('#' + d.close).close();
      return;
    }
    if (d.detail) {
      openDetail(d.detail);
      return;
    }
    if (d.plan) {
      setPlan(d.plan, !state.plan.includes(d.plan));
      return;
    }
    if (d.favoriteToggle) {
      void toggleAwsFavorite(d.favoriteToggle);
      return;
    }
    if (d.removePlan) {
      state.plan = state.plan.filter((id) => id !== d.removePlan);
      savePlan();
      notify(t('My Planから削除しました'));
      return;
    }
    if (d.editPersonalTime) {
      const item = state.awsPersonalTimes.find(
        (value) => value.personalTimeId === d.editPersonalTime,
      );
      if (item) openPersonalTime(item);
      return;
    }
    if (d.deletePersonalTime) {
      openPersonalTimeDelete(d.deletePersonalTime);
      return;
    }
    if (d.quickKey) {
      if (d.quickKey === 'minLevel') {
        const active = Number(state.filters.minLevel) === Number(d.quickValue);
        state.filters.minLevel = active ? null : Number(d.quickValue);
        state.filters.levelDefaultSuppressed = active;
      } else if (d.quickKey === 'includeUnleveled') {
        state.filters.includeUnleveled = !state.filters.includeUnleveled;
      } else {
        const list = state.filters[d.quickKey];
        state.filters[d.quickKey] = list.includes(d.quickValue)
          ? list.filter((v) => v !== d.quickValue)
          : [...list, d.quickValue];
      }
      commitSearch();
      return;
    }
    if (d.removeFilter) {
      if (d.removeFilter === 'time') {
        state.filters.from = '';
        state.filters.to = '';
        state.filters.fit = 'overlap';
      } else if (d.removeFilter === 'minLevel') {
        state.filters.minLevel = null;
        state.filters.levelDefaultSuppressed = true;
      } else if (d.removeFilter === 'includeUnleveled') {
        state.filters.includeUnleveled = false;
      } else if (d.removeFilter === 'walkUpOnly') {
        state.filters.walkUpOnly = false;
      } else
        state.filters[d.removeFilter] = state.filters[d.removeFilter].filter(
          (v) => v !== d.filterValue,
        );
      commitSearch();
      return;
    }
    if (d.compareToggle) {
      toggleCompare(d.compareToggle);
      return;
    }
    if (d.conflictCompare) {
      const matches = conflictMap(plannerItems()).get(d.conflictCompare) || [];
      openCompare([d.conflictCompare, ...matches.map((s) => s.id)]);
      return;
    }
    if (d.gapStart) {
      findGap(d.gapDate, d.gapStart, d.gapEnd);
      return;
    }
    if (d.action === 'retry') load();
    if (d.action === 'signIn') beginSignIn();
    if (d.action === 'more') {
      displayLimit += 40;
      renderExplore(conflictMap(plannerItems()));
    }
    if (d.action === 'resetAll') resetFilters(true);
    if (d.action === 'resetFilters') resetFilters();
    if (d.action === 'browse') {
      changeActive('explore');
      $('#q').focus();
    }
    if (d.action === 'compareSelected') openCompare(state.compare);
    if (d.action === 'clearCompare') {
      state.compare = [];
      render();
    }
    return;
  }
  if (event.target.closest('a,input,select,label')) return;
  const card = event.target.closest('[data-card-detail]');
  if (card) openDetail(card.dataset.cardDetail);
});
window.addEventListener('popstate', () => {
  const parsed = readSearchState(window.location.href);
  state.view = parsed.view;
  state.sort = parsed.sort;
  state.exploreKind = parsed.kind;
  if (parsed.kind === 'sideEvents') {
    state.filters = sideEventFiltersFrom(parsed.filters);
    state.sideEventFilters = structuredClone(state.filters);
  } else {
    state.filters = parsed.filters;
    state.sessionFilters = structuredClone(state.filters);
  }
  buildFacets();
  $('#q').value = state.filters.query;
  displayLimit = 40;
  clearTimeout(searchTimer);
  render();
});
// WebMCP is a browser-scoped prototype. Plan edits stay local to this tab and
// never call AWS reservation or cancellation endpoints.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(
        () => {},
      );
    } catch {}
  };
  const sessionSummary = (s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    venue: s.venue,
    sessionType: s.sessionType,
    level: s.level,
  });
  register({
    name: 'search_sessions',
    description:
      'Search sessions in the currently loaded catalog using the app search and filters. This reads catalog data and updates the visible results; it does not reserve sessions.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute(input) {
      if (typeof input?.query !== 'string') throw new Error('query must be a string');
      state.filters.query = input.query;
      $('#q').value = input.query;
      commitSearch({ push: false });
      changeActive('explore');
      return {
        dataSource: state.source,
        count: results().length,
        sessions: results().slice(0, 40).map(sessionSummary),
      };
    },
  });
  register({
    name: 'get_my_plan',
    description:
      'Read this browser profile’s planner: local picks, AWS reservations, and AWS personal time. Personal-time changes are managed in the app and written to AWS Schedule after explicit confirmation. AWS favorites are returned separately.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute() {
      return {
        dataSource: state.source,
        accountScoped: state.source === 'live' && !!state.accountId,
        awsScheduleStatus: state.awsScheduleStatus,
        localSessionIds: [...state.plan],
        awsFavoriteSessionIds: [...state.awsFavorites],
        sessions: plannerItems().map((s) => ({
          ...sessionSummary(s),
          planned: state.plan.includes(s.id),
          awsReserved: state.awsReserved.has(s.id),
          awsPersonalTime: s.itemType === 'personalTime',
        })),
        missingSessionIds: state.plan.filter((id) => !byId(id)),
      };
    },
  });
  register({
    name: 'check_schedule_conflicts',
    description:
      'Check local time overlaps between loaded sessions, local picks, reservations, and personal time imported from AWS Schedule. It does not change any AWS reservation.',
    inputSchema: {
      type: 'object',
      properties: { sessionIds: { type: 'array', items: { type: 'string' }, maxItems: 100 } },
      required: ['sessionIds'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute(input) {
      if (
        !Array.isArray(input?.sessionIds) ||
        input.sessionIds.length > 100 ||
        input.sessionIds.some((id) => typeof id !== 'string')
      )
        throw new Error('sessionIds must be an array of at most 100 strings');
      const ids = [...new Set([...plannerItems().map((item) => item.id), ...input.sessionIds])],
        items = ids.map(byId).filter(Boolean),
        conflicts = conflictMap(items),
        pairs = [],
        seen = new Set();
      for (const id of input.sessionIds) {
        const session = byId(id);
        if (!session) continue;
        for (const other of conflicts.get(id) || []) {
          const key = [id, other.id].sort().join('\u0000');
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ session: sessionSummary(session), conflictsWith: sessionSummary(other) });
        }
      }
      return {
        checkedSessionIds: input.sessionIds,
        missingSessionIds: input.sessionIds.filter((id) => !byId(id)),
        conflicts: pairs,
      };
    },
  });
  register({
    name: 'set_my_plan_session',
    description:
      'Add or remove one loaded session from this browser’s account-scoped My Plan. This is a local plan edit only; it does not reserve or cancel an AWS session.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, included: { type: 'boolean' } },
      required: ['id', 'included'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute(input) {
      if (typeof input?.id !== 'string' || typeof input.included !== 'boolean')
        throw new Error('id and included required');
      setPlan(input.id, input.included);
      return {
        sessionIds: [...state.plan],
        plan: chosen().map(sessionSummary),
        awsReservationChanged: false,
      };
    },
  });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
initialize();
// Refresh dated recommendation evidence when a backgrounded tab becomes active.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    render();
    void refreshAwsSchedule();
  }
});
