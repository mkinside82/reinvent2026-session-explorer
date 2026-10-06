import {t,ui} from './i18n.js';
import {esc} from './ui-utils.js?v=20261006';
import {TREND_SIGNALS,RECOMMENDATION_INTERESTS} from './recommendation-data.js';

// Evidence is intentionally explicit and expires quickly so dated trend claims
// cannot silently become evergreen recommendations.
export {TREND_SIGNALS,RECOMMENDATION_INTERESTS};

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
const stopWords=new Set(['about','after','amazon','aws','from','into','with','this','that','your','their','using','when','what','will','have','more','how','the','and','for','new','now','service','services']);
function newsTerms(article){
  const terms=[...(article.categories||[]),article.title||''].join(' ').normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}+#.-]{3,}/gu)||[];
  return [...new Set(terms.filter(term=>!stopWords.has(term)&&term.length>2))];
}
export function getNewsRecommendations(items,news,{today=new Date().toISOString().slice(0,10),limit=3,plan=[]}={}){
  if(!Array.isArray(news?.items))return [];
  const planned=new Set(plan.map(item=>item.id));
  return news.items.map((article,index)=>{
    const terms=newsTerms(article);
    if(!terms.length)return null;
    const matches=items.filter(item=>!planned.has(item.id)&&(!item.date||item.date>=today)).map(item=>{
      const text=corpus(item);
      const matchedTerms=terms.filter(term=>text.includes(term));
      return matchedTerms.length?{...item,matchedTerms,fitsPlan:fitsPlan(item,plan),matchScore:matchedTerms.length}:null;
    }).filter(Boolean).sort((a,b)=>b.matchScore-a.matchScore||Number(b.fitsPlan===true)-Number(a.fitsPlan===true)||Number(b.reservable===true)-Number(a.reservable===true)||a.title.localeCompare(b.title)).slice(0,3);
    if(!matches.length)return null;
    const published=article.publishedAt||'';
    const summary=article.summary||'AWS公式ブログの最新記事とセッションのキーワードが一致しました。';
    return {id:`aws-news-${index}`,title:article.title,reason:summary.length>280?`${summary.slice(0,277)}…`:summary,matches,verifiedAt:published,sources:[{label:article.sourceName||'AWS公式ブログ',url:article.url}],dynamic:true};
  }).filter(Boolean).slice(0,limit);
}
export function getPersonalizedRecommendations(items,{interests=[],today=new Date().toISOString().slice(0,10),limit=8,plan=[]}={}){
  const selected=RECOMMENDATION_INTERESTS.filter(option=>interests.includes(option.id));
  if(!selected.length)return [];
  const planned=new Set(plan.map(item=>item.id));
  return items.filter(item=>!planned.has(item.id)&&(!item.date||item.date>=today)).map(item=>{
    const text=corpus(item),matchedInterests=selected.filter(option=>option.terms.some(term=>text.includes(term))).map(option=>option.id);
    return matchedInterests.length?{...item,matchedInterests,fitsPlan:fitsPlan(item,plan)}:null;
  }).filter(Boolean).sort((a,b)=>b.matchedInterests.length-a.matchedInterests.length||Number(b.fitsPlan===true)-Number(a.fitsPlan===true)||Number(b.reservable===true)-Number(a.reservable===true)||a.title.localeCompare(b.title)).slice(0,limit);
}
export function renderRecommendations(recommendations,planned,interests=[],personalized=[],newsState={}){
  const lastValidUntil=recommendations.map(signal=>signal.expiresAt).filter(Boolean).sort().at(-1);
  const newsStatus=newsState.fetchedAt?ui`${t('AWS公式ブログ · 最終更新')} ${esc(new Date(newsState.fetchedAt*1000).toLocaleString())}${newsState.error?t(' · 更新失敗。前回の取得内容を表示中'):newsState.refreshing?t(' · 更新中'):''}`:newsState.refreshing?t('AWS公式ブログを確認中'):t('AWS公式記事を取得できていません');
  return ui`<section class="trend-panel" aria-labelledby="trendHeading"><div class="trend-heading"><div><p class="eyebrow">WHY NOW</p><h2 id="trendHeading">${t('今の注目テーマ')}</h2></div><span class="trend-expiry">${esc(newsStatus)}${lastValidUntil?ui` · ${t('最長有効期限')}: ${esc(lastValidUntil)}`:''}</span></div>${recommendations.length?ui`<p class="hint">${t('根拠を確認したテーマを表示しています。')}</p>${recommendations.map(signal=>ui`<article class="trend-card"><h3>${esc(signal.dynamic?signal.title:t(signal.title))}</h3><p>${esc(signal.dynamic?signal.reason:t(signal.reason))}</p><ul class="trend-sessions">${signal.matches.map(item=>ui`<li><span>${esc(item.code?ui`${item.code} · `:'')}${esc(item.title)}<small class="recommendation-fit">${item.fitsPlan===true?t('My Planの時間と重なりません'):item.fitsPlan===false?t('My Planの予定と重なります'):t('時間未定 · 空き時間は未確認')}</small></span><button class="${planned.has(item.id)?'quiet':'primary'} small" data-plan="${esc(item.id)}" aria-pressed="${planned.has(item.id)}">${planned.has(item.id)?t('候補から削除'):t('My Planに追加')}</button></li>`).join('')}</ul><div class="trend-sources"><span>${t(signal.dynamic?'AWS公式記事 · 公開日':'根拠 · 確認日')} ${esc(signal.verifiedAt)}</span>${signal.sources.map(source=>ui`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>`).join(' · ')}</div></article>`).join('')}`:''}<details class="recommendation-preferences"><summary>${t('興味のある分野を選んでおすすめを調整')}</summary><p class="hint">${t('選択した分野に合うセッションを優先表示します。選択はこのブラウザーに保存します。')}</p><div class="recommendation-interests">${RECOMMENDATION_INTERESTS.map(option=>ui`<button type="button" class="quick-chip ${interests.includes(option.id)?'selected':''}" data-interest="${option.id}" aria-pressed="${interests.includes(option.id)}">${option.label}</button>`).join('')}</div></details>${personalized.length?ui`<article class="personalized-recommendations"><h3>${t('あなたの関心分野から')}</h3><p class="hint">${t('未追加の候補を、選んだ関心分野とMy Planの空き時間に合わせて並べています。')}</p><ul class="trend-sessions">${personalized.map(item=>ui`<li><span>${esc(item.code?ui`${item.code} · `:'')}${esc(item.title)}<small class="recommendation-fit">${esc(item.matchedInterests.map(id=>RECOMMENDATION_INTERESTS.find(option=>option.id===id)?.label||id).join(' · '))} · ${item.fitsPlan===true?t('My Planの時間と重なりません'):item.fitsPlan===false?t('My Planの予定と重なります'):t('時間未定 · 空き時間は未確認')}</small></span><button class="primary small" data-plan="${esc(item.id)}">${t('My Planに追加')}</button></li>`).join('')}</ul></article>`:''}</section>`;
}
