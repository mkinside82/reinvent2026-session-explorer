import { t, ui, stateLabel } from './i18n.js';
import {
  validInterval,
  intervalBounds,
  timelineLayout,
  freeSlots,
  sessionStates,
} from './session-model.js';
import { esc, dateLabel, timeLabel, place, clock, blank } from './ui-utils.js?v=20261007';
const AWS_EVENT_CATALOG_URL =
  'https://registration.awsevents.com/flow/awsevents/reinvent2026/eventcatalog/page/eventcatalog';
const statusClass = (value) =>
  ({ 'Very limited': 'very-limited', 'Walk-up': 'walk-up' })[value] || value.toLowerCase();
export const statusTags = (s, planned, conflicted, includeUnplanned = false) =>
  ui`<div class="status-tags">${sessionStates(s, planned, conflicted)
    .filter((v) => includeUnplanned || v !== 'Not planned')
    .map((v) => ui`<span class="status-tag ${statusClass(v)}">${esc(stateLabel(v))}</span>`)
    .join('')}</div>`;
export function sessionCode(s, compact = false) {
  const code = String(s.code || '').trim();
  if (!code) return ui`<span class="session-code-empty">—</span>`;
  return ui`<span class="session-code-chip ${compact ? 'is-compact' : ''}"><span class="session-code-label">${t('セッションコード')}</span><strong>${esc(code)}</strong><button type="button" class="copy-code-button" data-copy-code="${esc(code)}" aria-label="${t('セッションコードをコピー')} ${esc(code)}" title="${t('セッションコードをコピー')}"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button></span>`;
}
export function walkupNotice(s, compact = false) {
  if (s.uiState?.availability !== 'walkUp') return '';
  return ui`<div class="walkup-notice ${compact ? 'is-compact' : ''}" role="note"><span class="walkup-mark" aria-hidden="true">!</span><span class="walkup-copy"><strong>${t('Walk-up Only（当日参加のみ）')}</strong><small>${t('事前予約不可 · 当日会場で参加')}</small></span></div>`;
}
export function conflictNote(s, map) {
  const matches = map.get(s.id) || [];
  return matches.length
    ? ui`<div class="conflict-note"><strong>Schedule Conflict</strong> · ${matches.map((other) => ui`<button class="conflict-link" data-detail="${esc(other.id)}">${esc(other.code || other.title)}</button>`).join('、')} と重複<button class="compare-conflict" data-conflict-compare="${esc(s.id)}">Compare</button></div>`
    : '';
}
export function planAction(s, included) {
  if (s.itemType === 'personalTime')
    return ui`<span class="status-tag personal-time">${stateLabel('Personal time')} · ${t('AWS Scheduleから同期')}</span>`;
  if (s.uiState?.attendance === 'reserved' && !included)
    return ui`<span class="status-tag reserved">${stateLabel('Reserved')} · ${t('My Planに表示中')}</span>`;
  return ui`<button class="small ${included ? 'saved-button' : 'primary'}" data-plan="${esc(s.id)}" aria-pressed="${included}" aria-label="${esc(s.code || s.title)}を${included ? t('My Planから外す') : t('My Planに追加')}">${included ? (s.uiState?.attendance === 'reserved' ? t('✓ ローカル候補を外す') : t('✓ Planned · 外す')) : t('+ Add to Plan')}</button>`;
}
export function favoriteAction(s, favoritesEnabled = false, pending = false, unknown = false) {
  if (!favoritesEnabled || s.dataSource !== 'aws') return '';
  const favorited = s.uiState?.favorite === true;
  if (unknown)
    return ui`<button class="quiet small favorite-toggle" aria-disabled="true" disabled>${t('お気に入り結果不明 · AWS Scheduleを更新してください')}</button>`;
  return ui`<button class="quiet small favorite-toggle" data-favorite-toggle="${esc(s.id)}" aria-pressed="${favorited}" ${pending ? 'disabled' : ''}>${favorited ? '★' : '☆'} ${t(favorited ? 'AWSお気に入りから削除' : 'AWSお気に入りに追加')}</button>`;
}
export function sideEventSource(s) {
  return s.itemType === 'sideEvent' && s.sourceUrl
    ? ui`<a class="source-link" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('出典')}: ${esc(s.sourceName || t('掲載元'))}</a>${s.listingUrl && s.listingUrl !== s.sourceUrl ? ui`<span> · </span><a class="source-link" href="${esc(s.listingUrl)}" target="_blank" rel="noopener noreferrer">${t('Conference Parties一覧')}</a>` : ''}`
    : '';
}
function sideEventTimingLabel(s) {
  return (
    {
      listed: t('出典一覧に掲載された時刻'),
      confirmed: t('主催者ページに掲載された時刻'),
      tentative: t('暫定時刻'),
      unknown: t('時刻未確認'),
    }[s.timingStatus] || t('時刻未確認')
  );
}
export function sideEventDetails(s) {
  if (s.itemType !== 'sideEvent') return '';
  const registration = s.registrationUrl
    ? ui`<a href="${esc(s.registrationUrl)}" target="_blank" rel="noopener noreferrer">申込ページ</a>`
    : s.registrationRequired === false
      ? t('申込不要と掲載されています')
      : t('申込条件は主催者に確認');
  return ui`<dt>${t('出典')}</dt><dd>${sideEventSource(s)}</dd><dt>${t('出典確認日')}</dt><dd>${esc(s.verifiedAt || t('不明'))}</dd><dt>${t('時刻情報')}</dt><dd>${esc(sideEventTimingLabel(s))} · ${esc(s.timezone || t('タイムゾーン未定'))}</dd>${s.sponsor ? ui`<dt>${t('主催')}</dt><dd>${esc(s.sponsor)}</dd>` : ''}${s.uiState?.availability === 'full' ? ui`<dt>${t('受付状況')}</dt><dd>${t('満席として掲載されています')}</dd>` : ''}<dt>${t('申込')}</dt><dd>${registration}${s.registrationRequired === true ? t(' · 申込が必要') : s.registrationRequired === false ? t(' · 申込不要') : t(' · 要確認')}</dd>`;
}
export function renderCard(
  s,
  plan,
  map,
  compare,
  favoritesEnabled = false,
  favoritePending = false,
  favoriteUnknown = false,
) {
  const included = plan.has(s.id),
    conflicted = !!map.get(s.id)?.length,
    side = s.itemType === 'sideEvent';
  return ui`<article class="session-card" data-card-detail="${esc(s.id)}" data-session-id="${esc(s.id)}"><div class="card-heading"><h3><button class="title-button" data-detail="${esc(s.id)}">${esc(s.title)}</button>${sessionCode(s)}</h3>${statusTags(s, included, conflicted)}</div>${walkupNotice(s)}<div class="time-line"><span>${esc(timeLabel(s))}</span><span class="date">${esc(dateLabel(s.date))}</span></div><div class="card-meta"><span>${side ? t('サイドイベント') : esc(s.sessionType || t('Type未定'))}</span>${side ? ui`<span class="meta-separator">·</span><span>${esc(s.topics[0] || t('コミュニティイベント'))}</span>` : ui`<span class="meta-separator">·</span><span>Level ${esc(s.level || t('未定'))}</span><span class="meta-separator">·</span><span>${esc(s.track || t('Track未定'))}</span>`}</div><p class="card-summary">${esc(s.abstract || t('概要はまだ公開されていません。'))}</p><div class="topic-tags">${[
    ...s.topics,
    ...s.services,
  ]
    .slice(0, 6)
    .map((t) => ui`<span class="topic-tag">${esc(t)}</span>`)
    .join(
      '',
    )}</div><div class="card-info"><div class="info-row"><span class="info-label">${t('会場')}</span><span>${esc(place(s))}</span></div>${side && s.sponsor ? ui`<div class="info-row"><span class="info-label">${t('主催')}</span><span>${esc(s.sponsor)}</span></div>` : ''}${side ? '' : ui`<div class="info-row"><span class="info-label">${t('登壇者')}</span><span>${esc(s.speakers.join('、') || t('登壇者未定'))}</span></div>`}</div>${side ? ui`<p class="hint">${esc(sideEventTimingLabel(s))} · ${t('出典確認日')} ${esc(s.verifiedAt || t('不明'))} · ${sideEventSource(s)}</p>` : ''}${included ? conflictNote(s, map) : ''}<div class="card-actions"><button class="compare-toggle" data-compare-toggle="${esc(s.id)}" aria-pressed="${compare.includes(s.id)}">${compare.includes(s.id) ? t('✓ 比較対象') : t('比較に追加')}</button>${favoriteAction(s, favoritesEnabled, favoritePending, favoriteUnknown)}${planAction(s, included)}</div></article>`;
}
export function renderCompact(
  items,
  plan,
  map,
  compare,
  favoritesEnabled = false,
  pendingIds = new Set(),
  unknownIds = new Set(),
) {
  return ui`<div class="compact-list"><div class="compact-header" aria-hidden="true"><span>Time</span><span>Title / Venue</span><span>Type / Level</span><span>Plan</span></div>${items
    .map((s) => {
      const included = plan.has(s.id),
        conflicted = !!map.get(s.id)?.length;
      return ui`<article class="compact-row" data-card-detail="${esc(s.id)}" data-session-id="${esc(s.id)}"><div class="compact-time">${esc(timeLabel(s))}<span class="date">${esc(dateLabel(s.date))}</span></div><div class="compact-title"><h3><button class="title-button" data-detail="${esc(s.id)}">${esc(s.title)}</button></h3>${walkupNotice(s, true)}<div class="compact-sub"><span>${esc(place(s))}</span><span>· ${esc(s.sessionType || t('Type未定'))} · Level ${esc(s.level || t('未定'))}</span></div><div class="compact-actions">${sessionCode(s, true)}<button class="compare-toggle" data-compare-toggle="${esc(s.id)}" aria-pressed="${compare.includes(s.id)}">${compare.includes(s.id) ? t('✓ 比較対象') : t('比較に追加')}</button>${favoriteAction(s, favoritesEnabled, pendingIds.has(s.id), unknownIds.has(s.id))}${conflicted ? ui`<button class="conflict-link" data-conflict-compare="${esc(s.id)}">Conflict · Compare</button>` : ''}</div></div><div class="compact-type">${esc(s.sessionType || t('Type未定'))}<br>Level ${esc(s.level || t('未定'))}</div><div class="compact-status">${statusTags(s, included, conflicted)}${planAction(s, included)}</div></article>`;
    })
    .join('')}</div>`;
}
export function renderPlanList(
  items,
  map,
  allDates = false,
  localPlan = new Set(),
  favoritesEnabled = false,
  pendingIds = new Set(),
  unknownIds = new Set(),
  referenceDate = '',
) {
  let last;
  return items
    .map((s) => {
      const heading =
        allDates && last !== s.date
          ? ui`<p class="eyebrow" style="margin-top:16px">${esc(dateLabel(s.date))}</p>`
          : '';
      last = s.date;
      const reserved = s.uiState?.attendance === 'reserved',
        favorited = s.uiState?.favorite === true;
      return (
        heading +
        ui`<article class="plan-item" data-planned-id="${esc(s.id)}"><div class="plan-item-top"><span class="plan-item-time">${esc(timeLabel(s, referenceDate || s.date))}</span><div class="plan-item-actions">${s.itemType === 'personalTime' ? ui`<span class="status-tag personal-time">${stateLabel('Personal time')}</span>${validInterval(s) ? ui`<button class="quiet small" data-edit-personal-time="${esc(s.personalTimeId)}">${t('編集')}</button>` : ''}<button class="quiet small" data-delete-personal-time="${esc(s.personalTimeId)}">${t('削除')}</button>` : ''}${reserved ? ui`<span class="status-tag reserved">${stateLabel('Reserved')}</span>` : ''}${favorited ? ui`<span class="status-tag favorite">${stateLabel('Favorite')}</span>` : ''}${favoriteAction(s, favoritesEnabled, pendingIds.has(s.id), unknownIds.has(s.id))}${localPlan.has(s.id) ? ui`<button class="remove-button" data-remove-plan="${esc(s.id)}" aria-label="${esc(s.code || s.title)}の候補をMy Planから削除">候補を外す</button>` : ''}</div></div><h3><button class="title-button" data-detail="${esc(s.id)}">${esc(s.title)}</button></h3><div class="plan-item-meta">${sessionCode(s, true)}<span>${esc(place(s))}</span></div>${walkupNotice(s, true)}${sideEventSource(s)}${!validInterval(s) ? t('<p class="hint" style="margin-top:14px">日時未定のため、重複を確認できません。</p>') : ''}${conflictNote(s, map)}</article>`
      );
    })
    .join('');
}
export function renderTimeline(
  items,
  map,
  date,
  localPlan = new Set(),
  favoritesEnabled = false,
  pendingIds = new Set(),
  unknownIds = new Set(),
) {
  const timed = items.filter(validInterval),
    unknown = items.filter((s) => !validInterval(s));
  let html = '';
  if (timed.length) {
    const bounds = timed
        .map((s) => intervalBounds(s, date))
        .filter(Boolean)
        .map(([a, b]) => [Math.max(0, a), Math.min(1440, b)])
        .filter(([a, b]) => a < b),
      start = Math.min(9 * 60, Math.floor(Math.min(...bounds.map(([a]) => a)) / 60) * 60),
      end = Math.max(18 * 60, Math.ceil(Math.max(...bounds.map(([, b]) => b)) / 60) * 60),
      scale = 1.8;
    const gaps = freeSlots(timed, start, end, date);
    const hours = [];
    for (let t = start; t <= end; t += 60)
      hours.push(
        ui`<div class="hour-line" style="top:${(t - start) * scale + 12}px"><span>${clock(t)}</span></div>`,
      );
    const slots = timelineLayout(timed, date)
      .map(
        ({ session: s, start: itemStart, end: itemEnd, lane, lanes }) =>
          ui`<button data-detail="${esc(s.id)}" data-timeline-id="${esc(s.id)}" class="timeline-slot ${map.get(s.id)?.length ? 'conflicting' : ''}" style="top:${(itemStart - start) * scale + 12}px;height:${(itemEnd - itemStart) * scale}px;left:calc(${(lane / lanes) * 100}% + 3px);width:calc(${100 / lanes}% - 6px)" aria-label="${esc(s.title)}、${esc(timeLabel(s, date))}${s.uiState?.availability === 'walkUp' ? t('、Walk-up Only・事前予約不可') : ''}${s.uiState?.attendance === 'reserved' ? `、${stateLabel('Reserved')}` : ''}${s.uiState?.favorite ? `、${stateLabel('Favorite')}` : ''}${map.get(s.id)?.length ? '、Conflict' : ''}" title="${esc(s.title)}"><span class="slot-time">${esc(timeLabel(s, date))}</span><span class="slot-title">${esc(s.title)}</span><span class="slot-code">${esc(s.code)}${s.uiState?.attendance === 'reserved' ? ui` · ${stateLabel('Reserved')}` : ''}${s.uiState?.favorite ? ui` · ${stateLabel('Favorite')}` : ''}${s.uiState?.availability === 'walkUp' ? ui` · ${t('Walk-up Only')}` : ''}${map.get(s.id)?.length ? ' · Conflict' : ''}</span></button>`,
      )
      .join('');
    const free = gaps
      .filter((g) => g.duration >= 30)
      .map(
        (g) =>
          ui`<button class="free-slot" data-gap-start="${clock(g.start)}" data-gap-end="${clock(g.end)}" data-gap-date="${date}" style="top:${(g.start - start) * scale + 12}px;height:${g.duration * scale}px" aria-label="${clock(g.start)}から${clock(g.end)}の空き時間でセッションを探す"><strong>FREE ${g.duration} min</strong><span>${clock(g.start)}–${clock(g.end)}</span>${g.duration >= 60 ? '<span>Find sessions for this time</span>' : ''}</button>`,
      )
      .join('');
    html = ui`<p class="timeline-caption">${esc(dateLabel(date))} · 09:00–18:00を基本に表示<br>タップで詳細 · 重複は横並び</p><div class="timeline-scroll"><div class="timeline-canvas" style="height:${(end - start) * scale + 36}px">${hours.join('')}${free}${slots}</div></div><div class="gap-list"><h3>空き時間</h3>${gaps.length ? gaps.map((g) => ui`<div class="gap-row"><span>${clock(g.start)}–${clock(g.end)}<br><span class="muted">FREE ${g.duration} min</span></span><button data-gap-start="${clock(g.start)}" data-gap-end="${clock(g.end)}" data-gap-date="${date}">Find sessions for this time</button></div>`).join('') : t('<p class="hint">表示時間内に空きはありません。</p>')}<p class="hint" style="margin-top:8px">移動時間は含みません。会場間の移動も考慮してください。</p></div>`;
    const conflicted = timed.filter((s) => map.get(s.id)?.length);
    if (conflicted.length)
      html += ui`<div class="timeline-conflicts"><h3>Schedule Conflict</h3>${renderPlanList(conflicted, map, false, localPlan, favoritesEnabled, pendingIds, unknownIds, date)}</div>`;
    html += ui`<details class="timeline-session-list"><summary>この日の候補を整理（${timed.length}件）</summary>${renderPlanList(timed, map, false, localPlan, favoritesEnabled, pendingIds, unknownIds, date)}</details>`;
  }
  if (unknown.length)
    html += ui`<p class="eyebrow" style="margin-top:16px">日時未定 · Timeline対象外</p>${renderPlanList(unknown, map, false, localPlan, favoritesEnabled, pendingIds, unknownIds)}`;
  return html;
}
export function renderDetail(
  s,
  plan,
  map,
  translation = { status: 'idle', text: '' },
  favoritesEnabled = false,
  favoritePending = false,
  favoriteUnknown = false,
) {
  const included = plan.has(s.id),
    statusNote =
      s.itemType === 'personalTime'
        ? t('AWS Scheduleの個人予定です。編集・削除はAWS側へ反映します。')
        : s.dataSource === 'aws'
          ? s.uiState?.availability === 'walkUp'
            ? t('Walk-up Onlyです。事前予約できず、現地で当日参加するセッションです。')
            : s.reservable === null
              ? t('予約可否はAPIから提供されていません。')
              : s.reservable
                ? t('AWS API上は予約対象です。ここでは予約しません。')
                : t('AWS API上は予約対象外です。')
          : s.itemType === 'sideEvent'
            ? t('サイドイベント情報です。AWSセッションの予約対象ではありません。')
            : t('空席・予約状態はデモです。'),
    timeBasis =
      s.itemType === 'sideEvent'
        ? ui`${sideEventTimingLabel(s)} · ${s.timezone || t('タイムゾーン未定')}`
        : s.dataSource.startsWith('aws')
          ? t('AWSが返したUTC時刻をLas Vegasの時刻に変換')
          : t('会場現地時間（Las Vegas）'),
    translated =
      translation.status === 'ready'
        ? ui`<p class="translation-result" lang="ja">${esc(translation.text)}</p>`
        : '',
    translationStatus =
      translation.status === 'loading'
        ? t('Chromeの翻訳モデルを準備しています。初回はダウンロードに時間がかかることがあります。')
        : translation.status === 'error'
          ? t('端末内翻訳を利用できません。Chromeのページ翻訳も使えます。')
          : '';
  return ui`<div class="sheet-top"><div><p class="eyebrow">SESSION DETAIL</p>${sessionCode(s)}</div><button class="icon-button" data-close="detailDialog" aria-label="Session Detailを閉じる">×</button></div><div class="detail-body"><h2 id="detailTitle" class="detail-title">${esc(s.title)}</h2>${statusTags(s, included, !!map.get(s.id)?.length)}${walkupNotice(s)}<p class="detail-abstract">${esc(s.abstract || t('概要はまだ公開されていません。'))}</p>${s.abstract ? ui`<div class="translation-inline"><button class="quiet small" data-translate-detail="${esc(s.id)}" ${translation.status === 'loading' ? 'disabled' : ''}>${translation.status === 'ready' ? t('再翻訳') : t('日本語訳')}</button><span class="hint" role="status">${translationStatus}</span>${translated}</div>` : ''}<dl class="detail-grid"><dt>Speakers</dt><dd>${esc(s.speakers.join('、') || t('登壇者未定'))}</dd><dt>Date / Time</dt><dd>${esc(s.date ? ui`${s.date} · ${dateLabel(s.date)}` : t('日付未定'))}<br>${esc(timeLabel(s))}<br><span class="hint">${esc(timeBasis)}</span></dd><dt>Venue / Room</dt><dd>${esc(place(s))}</dd><dt>Level / Type</dt><dd>Level ${esc(s.levelLabel || s.level || t('未定'))} · ${esc(s.sessionType || t('Type未定'))}</dd><dt>Track</dt><dd>${esc(s.tracks.join('、') || t('Track未定'))}</dd><dt>Topics</dt><dd>${esc(s.topics.join('、') || t('未定'))}</dd><dt>Services</dt><dd>${esc(s.services.join('、') || t('未指定'))}</dd><dt>Roles / Industries</dt><dd>${esc([...s.roles, ...s.industries].join('、') || t('未指定'))}</dd><dt>Keywords</dt><dd>${esc(s.keywords.join('、') || t('未指定'))}</dd>${s.dataSource === 'aws' ? ui`<dt>Reservable</dt><dd>${s.reservable === null ? t('不明') : s.reservable ? 'Yes' : 'No'}</dd><dt>${t('公式情報')}</dt><dd><a class="source-link" href="${AWS_EVENT_CATALOG_URL}" target="_blank" rel="noopener noreferrer">${t('AWS公式カタログで開く')}</a><p class="hint">${t('AWS公式カタログでセッションコードを検索してください。')}</p></dd>` : ''}${sideEventDetails(s)}</dl>${!validInterval(s) ? t('<p class="hint" style="margin-top:14px">日時未定のため、重複を確認できません。</p>') : ''}${included ? conflictNote(s, map) : ''}<button class="quiet small" data-compare-toggle="${esc(s.id)}" style="margin-top:16px">比較対象に追加 / 解除</button></div><div class="sheet-footer detail-footer">${favoriteAction(s, favoritesEnabled, favoritePending, favoriteUnknown)}<p class="detail-note">${esc(statusNote)} My Planへの追加は予約ではありません。</p>${planAction(s, included)}</div>`;
}
export function renderComparison(items, plan, map) {
  if (items.length < 2)
    return ui`<div class="sheet-top"><h2 id="compareTitle">Session Compare</h2><button class="icon-button" data-close="compareDialog" aria-label="比較を閉じる">×</button></div>${blank(t('2件以上のセッションを選んでください'), t('一覧の「比較に追加」で最大3件を選べます。'))}`;
  const rows = [
    ['Time', (s) => ui`${s.date || t('日付未定')} / ${timeLabel(s)}`],
    ['Abstract', (s) => s.abstract || t('概要未定')],
    ['Type / Level', (s) => ui`${s.sessionType || t('Type未定')} / Level ${s.level || t('未定')}`],
    ['Speaker', (s) => s.speakers.join('、') || t('登壇者未定')],
    ['Track / Topic', (s) => [s.track, ...s.topics].filter(Boolean).join('、') || t('未定')],
    ['Service', (s) => s.services.join('、') || t('未指定')],
    ['Venue', (s) => place(s)],
  ];
  return ui`<div class="sheet-top"><div><p class="eyebrow">DECIDE YOUR SESSION</p><h2 id="compareTitle">Session Compare</h2></div><button class="icon-button" data-close="compareDialog" aria-label="比較を閉じる">×</button></div><div class="compare-body"><p class="hint">${items.length}件を比較 · 追加は予約ではありません。</p><div class="compare-scroll"><table class="compare-table" style="min-width:${95 + items.length * 240}px"><caption>モバイルでは横にスクロールして比較できます。</caption><thead><tr><th scope="col" style="width:95px">項目</th>${items.map((s) => ui`<th scope="col">${esc(s.title)}<div class="compare-session-code">${sessionCode(s, true)}</div></th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => ui`<tr><th scope="row">${t(label)}</th>${items.map((s) => ui`<td class="${label === 'Abstract' ? 'summary-cell' : ''}">${esc(get(s))}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">状態</th>${items.map((s) => ui`<td>${statusTags(s, plan.has(s.id), !!map.get(s.id)?.length, true)}</td>`).join('')}</tr><tr><th scope="row">My Plan</th>${items.map((s) => ui`<td>${planAction(s, plan.has(s.id))}</td>`).join('')}</tr></tbody></table></div></div>`;
}
