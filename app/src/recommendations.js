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
   verifiedAt:'2026-10-05',expiresAt:'2026-10-19'},
  {id:'hands-on-learning',title:'実際に手を動かして学ぶ',
   reason:'AWS re:Invent 2026は2,200以上のセッションを掲載し、その70%をインタラクティブ形式と案内しています。講演を聞くだけでなく、WorkshopやBuilders’ sessionなど手を動かせる形式を優先しました。',
   terms:['workshop','builders','chalk talk','hands-on','interactive'],
   sources:[{label:'AWS re:Invent 2026 · Session Types & Learning Formats',url:'https://aws.amazon.com/events/reinvent/sessions/how-youll-learn/'},{label:'AWS re:Invent 2026 · Session Catalog',url:'https://catalog.awsevents.com/'}],
   verifiedAt:'2026-10-06',expiresAt:'2026-12-05'}
]);

const corpus=s=>[s.title,s.abstract,s.code,s.track,s.sessionType,...(s.tracks||[]),...(s.topics||[]),...(s.services||[]),...(s.keywords||[])].join(' ').normalize('NFKC').toLocaleLowerCase();
const expired=(date,today)=>!date||date<today;
const timeMinutes=value=>{const match=/^(\d{2}):(\d{2})$/.exec(value||'');return match?Number(match[1])*60+Number(match[2]):null;};
function fitsPlan(item,plan){const start=timeMinutes(item.startTime),end=timeMinutes(item.endTime);if(!item.date||start===null||end===null)return null;return !plan.some(existing=>{if(existing.date!==item.date)return false;const otherStart=timeMinutes(existing.startTime),otherEnd=timeMinutes(existing.endTime);return otherStart!==null&&otherEnd!==null&&start<otherEnd&&otherStart<end;});}
export function getRecommendations(items,{today=new Date().toISOString().slice(0,10),limit=3,plan=[]}={}){
  const planned=new Set(plan.map(item=>item.id));
  return TREND_SIGNALS.filter(signal=>!expired(signal.expiresAt,today)).map(signal=>{
    const terms=signal.terms.map(term=>term.toLocaleLowerCase());
    const matches=items.filter(item=>!planned.has(item.id)&&(!item.date||item.date>=today)&&terms.some(term=>corpus(item).includes(term)))
      .map(item=>({...item,fitsPlan:fitsPlan(item,plan)}))
      .sort((a,b)=>Number(b.fitsPlan===true)-Number(a.fitsPlan===true)||Number(b.reservable===true)-Number(a.reservable===true)||Number(b.level||0)-Number(a.level||0)||a.title.localeCompare(b.title)).slice(0,limit);
    return {...signal,matches};
  }).filter(signal=>signal.matches.length);
}
export function renderRecommendations(recommendations,planned){
  if(!recommendations.length)return '';
  return ui`<section class="trend-panel" aria-labelledby="trendHeading"><div class="trend-heading"><div><p class="eyebrow">WHY NOW</p><h2 id="trendHeading">今の注目テーマ</h2></div><span class="trend-expiry">2026-10-19まで有効</span></div><p class="hint">${t('My Plan候補と重ならないセッションを優先しています。')}</p>${recommendations.map(signal=>ui`<article class="trend-card"><h3>${esc(t(signal.title))}</h3><p>${esc(t(signal.reason))}</p><ul class="trend-sessions">${signal.matches.map(item=>ui`<li><span>${esc(item.code?ui`${item.code} · `:'')}${esc(item.title)}<small class="recommendation-fit">${item.fitsPlan===true?t('My Planの時間と重なりません'):item.fitsPlan===false?t('My Planの予定と重なります'):t('時間未定 · 空き時間は未確認')}</small></span><button class="${planned.has(item.id)?'quiet':'primary'} small" data-plan="${esc(item.id)}" aria-pressed="${planned.has(item.id)}">${planned.has(item.id)?t('候補から削除'):t('My Planに追加')}</button></li>`).join('')}</ul><div class="trend-sources"><span>根拠 · 確認日 ${esc(signal.verifiedAt)}</span>${signal.sources.map(source=>ui`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>`).join(' · ')}</div></article>`).join('')}</section>`;
}
