import {t,ui} from './i18n.js';
import {esc} from './ui-utils.js?v=20261006';

// Evidence is intentionally explicit and expires quickly so dated trend claims
// cannot silently become evergreen recommendations.
export const TREND_SIGNALS=Object.freeze([
  {id:'production-agents',title:'AIエージェントを本番運用する',
   reason:'AWS re:Invent 2026の公式キュレーションで、エージェントの安全性・信頼性と本番化が取り上げられています。設計だけでなく、評価・権限・運用まで扱うセッションを優先しました。',
   terms:['agent','agentcore','agents','エージェント'],
   sources:[{label:'AWS re:Invent 2026 · Curated Agendas',url:'https://aws.amazon.com/events/reinvent/sessions/curated-agendas/'},{label:'AWS News Blog · What’s Next with AWS 2026',url:'https://aws.amazon.com/blogs/aws/top-announcements-of-the-whats-next-with-aws-2026/'}],
   verifiedAt:'2026-10-05',expiresAt:'2026-10-19'},
  {id:'secure-agents',title:'エージェントの権限と安全性を設計する',
   reason:'AWS公式の今年のSecurity Focusはagentic securityを含み、ガバナンス・ID・認可・安全策を扱うと案内しています。AIを作るだけでなく、制御方法を学べる候補です。',
   terms:['agent','security','identity','governance','authorization','安全'],
   sources:[{label:'AWS re:Invent 2026 · Security Focus',url:'https://aws.amazon.com/events/reinvent/sessions/security-focus/'},{label:'AWS re:Invent 2026 · Curated Agendas',url:'https://aws.amazon.com/events/reinvent/sessions/curated-agendas/'}],
   verifiedAt:'2026-10-05',expiresAt:'2026-10-19'}
]);

const corpus=s=>[s.title,s.abstract,s.code,s.track,...(s.tracks||[]),...(s.topics||[]),...(s.services||[]),...(s.keywords||[])].join(' ').normalize('NFKC').toLocaleLowerCase();
const expired=(date,today)=>!date||date<today;
export function getRecommendations(items,{today=new Date().toISOString().slice(0,10),limit=3}={}){
  return TREND_SIGNALS.filter(signal=>!expired(signal.expiresAt,today)).map(signal=>{
    const terms=signal.terms.map(term=>term.toLocaleLowerCase());
    const matches=items.filter(item=>{const text=corpus(item);return terms.some(term=>text.includes(term));})
      .sort((a,b)=>Number(b.level||0)-Number(a.level||0)||a.title.localeCompare(b.title)).slice(0,limit);
    return {...signal,matches};
  }).filter(signal=>signal.matches.length);
}
export function renderRecommendations(recommendations,planned){
  if(!recommendations.length)return '';
  return ui`<section class="trend-panel" aria-labelledby="trendHeading"><div class="trend-heading"><div><p class="eyebrow">WHY NOW</p><h2 id="trendHeading">今の注目テーマ</h2></div><span class="trend-expiry">2026-10-19まで有効</span></div>${recommendations.map(signal=>ui`<article class="trend-card"><h3>${esc(t(signal.title))}</h3><p>${esc(t(signal.reason))}</p><ul class="trend-sessions">${signal.matches.map(item=>ui`<li><span>${esc(item.code?ui`${item.code} · `:'')}${esc(item.title)}</span><button class="${planned.has(item.id)?'quiet':'primary'} small" data-plan="${esc(item.id)}" aria-pressed="${planned.has(item.id)}">${planned.has(item.id)?t('候補から削除'):t('My Planに追加')}</button></li>`).join('')}</ul><div class="trend-sources"><span>根拠 · 確認日 ${esc(signal.verifiedAt)}</span>${signal.sources.map(source=>ui`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>`).join(' · ')}</div></article>`).join('')}</section>`;
}
