// Real application handlers + HTML renderers exercised with a lightweight DOM double.
// Viewport-dependent navigation is simulated. This is NOT visual browser/device QA.
import test from 'node:test';
import { t } from '../src/i18n.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile(new URL('../sessions.demo.json', import.meta.url), 'utf8'));
const sideEvents = JSON.parse(
  await readFile(new URL('../side-events.verified.json', import.meta.url), 'utf8'),
);
class Element {
  constructor() {
    this.value = '';
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.checked = false;
    this.dataset = {};
    this.events = {};
    this.attrs = {};
    const classes = new Set();
    this.classList = {
      toggle: (key, value) => {
        if (value) classes.add(key);
        else classes.delete(key);
      },
      contains: (key) => classes.has(key),
    };
  }
  addEventListener(name, fn) {
    (this.events[name] ??= []).push(fn);
  }
  setAttribute(name, value) {
    this.attrs[name] = value;
  }
  dispatch(name, event = {}) {
    for (const fn of this.events[name] || []) fn({ target: this, preventDefault() {}, ...event });
  }
  focus() {
    this.focused = true;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatch('close');
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
for (const width of [1440, 390])
  test(`${width}px: Level 200+ default → search → quick → advanced → compact → detail → plan → conflict → compare → remove → planner → free slot`, async () => {
    const elements = new Map(),
      get = (id) => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      };
    const doc = new Element();
    doc.querySelector = get;
    doc.body = new Element();
    const tools = {};
    doc.modelContext = { registerTool: (t) => (tools[t.name] = t) };
    const window = new Element();
    window.location = new URL('https://example.test/');
    window.scrollY = 275;
    window.matchMedia = () => ({ matches: width <= 900 });
    window.scrollTo = ({ top }) => (window.scrollY = top);
    window.history = {
      replaceState: (_a, _b, url) => (window.location = new URL(url)),
      pushState: (_a, _b, url) => (window.location = new URL(url)),
    };
    globalThis.window = window;
    globalThis.document = doc;
    const storage = new Map([
      ['reinvent-ui-language', 'ja'],
      ['reinvent-plan', '["SEC003"]'],
    ]);
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    };
    const large = [
      ...raw,
      ...Array.from({ length: 4982 }, (_, i) => ({
        ...raw[i % raw.length],
        id: `LOAD${i}`,
        code: `MOCK${i}`,
        title: `${raw[i % raw.length].title} (load-test ${i})`,
      })),
    ];
    let responseData = large,
      fetchFails = false;
    globalThis.fetch = async (url) => ({
      ok: !fetchFails,
      json: async () =>
        String(url).includes('side-events.verified.json') ? sideEvents : responseData,
    });
    await import(`../src/app.js?viewport=${width}`);
    await tick();
    assert.equal(
      get('#planDate').value,
      '2026-12-01',
      'default planner date follows the first upcoming saved plan day',
    );
    const click = (id) => get(id).dispatch('click');
    const delegated = (dataset) =>
      doc.dispatch('click', {
        target: {
          closest: (selector) => (selector === 'button' ? { dataset, disabled: false } : null),
        },
      });
    const input = async (id, value) => {
      get(id).value = value;
      get(id).dispatch('input');
      await new Promise((r) => setTimeout(r, 110));
    };
    const change = (id, value) => {
      get(id).value = value;
      get(id).dispatch('change');
    };
    assert.equal(get('#resultCount').textContent, '4,723' + t(' sessions'));
    assert.equal((get('#cards').innerHTML.match(/data-session-id=/g) || []).length, 40);
    assert.match(get('#cards').innerHTML, /さらに40件/);
    delegated({ action: 'more' });
    assert.equal((get('#cards').innerHTML.match(/data-session-id=/g) || []).length, 80);
    await input('#q', 'agent');
    assert(Number(get('#resultCount').textContent.replace(/[^\d]/g, '')) > 500);
    delegated({ quickKey: 'track', quickValue: 'AI / ML' });
    assert.match(get('#activeFilters').innerHTML, /AI \/ ML/);
    assert.match(get('#quickFilters').innerHTML, /aria-pressed="true"/);
    assert(window.location.search.includes('track='));
    click('#openFilters');
    assert(get('#filterDialog').open);
    const pick = (key, value) => {
      assert(
        (get('#dateFacet').innerHTML + get('#facetFields').innerHTML).includes(
          `data-facet="${key}" value="${value}"`,
        ),
      );
      doc.dispatch('change', { target: { dataset: { facet: key }, value, checked: true } });
    };
    pick('date', '2026-12-01');
    pick('level', '300');
    pick('topic', 'Agents');
    pick('service', 'Amazon Bedrock');
    pick('speaker', 'Demo Speaker A');
    get('#from').value = '10:00';
    get('#to').value = '11:00';
    get('#filterForm').dispatch('submit');
    assert(!get('#filterDialog').open);
    assert(window.location.search.includes('service='));
    assert.match(get('#activeFilters').innerHTML, new RegExp(t('Speaker')));
    click('#compactView');
    assert.match(get('#cards').innerHTML, /compact-row/);
    assert(window.location.search.includes('view=compact'));
    delegated({ detail: 'SEC001' });
    assert(get('#detailDialog').open);
    for (const expected of [
      'SESSION DETAIL',
      'Building reliable',
      'production-grade',
      'Speakers',
      'Date / Time',
      'Venue / Room',
      'Amazon Bedrock',
    ])
      assert(
        get('#detailContent').innerHTML.includes(t(expected)),
        `detail should include ${expected}`,
      );
    const currentURL = window.location.href,
      scrollBefore = window.scrollY;
    delegated({ plan: 'SEC001' });
    assert(JSON.parse(storage.get('reinvent-plan')).includes('SEC001'));
    delegated({ close: 'detailDialog' });
    assert.equal(window.location.href, currentURL);
    assert.equal(window.scrollY, scrollBefore);
    assert.match(get('#cards').innerHTML, /compact-row/);
    delegated({ action: 'resetAll' });
    delegated({ compareToggle: 'SEC001' });
    delegated({ compareToggle: 'SEC002' });
    assert.match(get('#compareTray').innerHTML, /2 \/ 3/);
    delegated({ action: 'compareSelected' });
    assert(get('#compareDialog').open);
    assert.match(get('#compareContent').innerHTML, /Accelerating software delivery/);
    const beforeLanguageURL = window.location.href,
      beforeLanguagePlan = storage.get('reinvent-plan');
    change('#languageSwitch', 'en');
    assert.equal(storage.get('reinvent-ui-language'), 'en');
    assert.equal(window.location.href, beforeLanguageURL);
    assert.equal(storage.get('reinvent-plan'), beforeLanguagePlan);
    assert(get('#compareDialog').open);
    assert.match(get('#compareContent').innerHTML, /items compared/);
    assert.match(get('#compareContent').innerHTML, /Accelerating software delivery/);
    change('#languageSwitch', 'ja');
    assert.match(get('#compareContent').innerHTML, /件を比較/);
    assert.equal(window.location.href, beforeLanguageURL);
    delegated({ close: 'compareDialog' });
    delegated({ plan: 'SEC002' });
    assert.match(get('#planSummary').innerHTML, new RegExp(t('Schedule Conflict')));
    delegated({ conflictCompare: 'SEC001' });
    assert(get('#compareDialog').open);
    for (const expected of [
      'Abstract',
      'Type / Level',
      'Speaker',
      'Track / Topic',
      'Venue',
      'DVT204',
    ])
      assert(get('#compareContent').innerHTML.includes(t(expected)));
    delegated({ plan: 'SEC002' });
    assert(!JSON.parse(storage.get('reinvent-plan')).includes('SEC002'));
    assert.doesNotMatch(get('#planSummary').innerHTML, new RegExp(t('Schedule Conflict')));
    assert.match(get('#compareContent').innerHTML, /My Planに追加/);
    delegated({ close: 'compareDialog' });
    click(width <= 900 ? '#mobilePlan' : '#showPlan');
    if (width <= 900) {
      assert(get('#sessionsPanel').classList.contains('mobile-hidden'));
      assert(get('#planPanel').classList.contains('mobile-active'));
    }
    change('#planDate', '2026-12-01');
    click('#timelineView');
    assert.match(get('#planContent').innerHTML, /data-timeline-id="SEC001"/);
    assert.match(get('#planContent').innerHTML, /FREE 120 min/);
    assert.match(get('#planContent').innerHTML, /11:00–13:00/);
    delegated({ gapStart: '11:00', gapEnd: '13:00', gapDate: '2026-12-01' });
    assert.match(get('#activeFilters').innerHTML, /枠内/);
    assert(window.location.search.includes('fit=contained'));
    assert(get('#cards').innerHTML.includes('AIM202'));
    assert(!get('#cards').innerHTML.includes('data-session-id="SEC002"'));
    if (width <= 900) assert(!get('#sessionsPanel').classList.contains('mobile-hidden'));
    window.location = new URL('https://example.test/?q=AIM301&view=compact&date=2026-12-01');
    window.dispatch('popstate');
    assert.equal(get('#q').value, 'AIM301');
    assert.equal(get('#resultCount').textContent, '1' + t(' sessions'));
    assert.match(get('#cards').innerHTML, /compact-row/);
    delegated({ action: 'resetAll' });
    click('#listView');
    change('#planDate', 'all');
    assert.match(get('#planContent').innerHTML, /SAS302/);
    change('#planDate', '2026-12-02');
    assert.match(get('#planContent').innerHTML, /この日の候補はありません/);
    click('#todayPlan');
    assert.match(get('#planContent').innerHTML, /この日の候補はありません/);
    await input('#q', 'no-results');
    assert.match(get('#cards').innerHTML, /一致するセッションがありません/);
    delegated({ action: 'resetAll' });
    click('#openFilters');
    get('#from').value = '11:00';
    get('#to').value = '10:00';
    get('#filterForm').dispatch('submit');
    assert.equal(get('#timeError').hidden, false);
    assert(get('#filterDialog').open);
    delegated({ close: 'filterDialog' });
    fetchFails = true;
    delegated({ action: 'retry' });
    assert.equal(get('#cards').attrs['aria-busy'], 'true');
    await tick();
    assert.match(get('#cards').innerHTML, /取得できませんでした/);
    assert(storage.get('reinvent-plan').includes('SEC001'));
    fetchFails = false;
    responseData = [];
    delegated({ action: 'retry' });
    await tick();
    assert.match(get('#cards').innerHTML, /データがまだありません/);
    assert.match(get('#planContent').innerHTML, /現在のデータにない候補/);
    responseData = raw;
    delegated({ action: 'retry' });
    await tick();
    delegated({ detail: 'SEC018' });
    assert.match(get('#detailContent').innerHTML, /時間未定/);
    assert.match(get('#detailContent').innerHTML, /登壇者未定/);
    delegated({ plan: 'SEC018' });
    delegated({ close: 'detailDialog' });
    change('#planDate', '2026-12-03');
    click('#timelineView');
    assert.match(get('#planContent').innerHTML, /Timeline対象外/);
    assert(tools.search_sessions);
    assert.equal(tools.search_sessions.execute({ query: 'AIM301' }).sessions[0].id, 'SEC001');
    assert.throws(() => tools.search_sessions.execute({ query: 3 }));
    assert.throws(() => tools.set_my_plan_session.execute({ id: 'unknown', included: true }));
    globalThis.localStorage.setItem = () => {
      throw Error('quota');
    };
    delegated({ plan: 'SEC005' });
    assert.equal(get('#storageWarning').hidden, false);
    click('#clearPlan');
    assert(get('#clearDialog').open);
    click('#confirmClear');
    assert.match(get('#planContent').innerHTML, /My Planはまだ空です/);
    const sessionCount = get('#resultCount').textContent;
    click('#showSessions');
    click('#showSideEvents');
    assert.match(get('#resultCount').textContent, /イベント・体験/);
    click('#openFilters');
    assert(get('#facetFields').innerHTML.includes('data-facet="topic"'));
    assert(get('#facetFields').innerHTML.includes('カテゴリ'));
    assert(get('#facetFields').innerHTML.includes('data-facet="venue"'));
    assert(!get('#facetFields').innerHTML.includes('data-facet="level"'));
    assert.equal(get('.time-facet').hidden, true);
    pick('topic', 'Hackathon');
    get('#filterForm').dispatch('submit');
    assert.match(get('#resultCount').textContent, /^1 /);
    assert.match(get('#cards').innerHTML, /Road to re:Invent 2026/);
    click('#showSessionItems');
    assert.equal(get('#resultCount').textContent, sessionCount);
  });
