#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {adaptAwsSessions,adaptAwsPersonalTimes} from './src/session-data.js';
import {conflictMap,freeSlots,minutes,validDate,validInterval} from './src/session-model.js';
import {RECOMMENDATION_INTERESTS,TREND_SIGNALS} from './src/recommendation-data.js';

const PORTS=[8484,8485,8486,8487,8488,8489];
const serverInfo={name:'reinvent-session-explorer',version:'0.1.0'};
const AWS_EVENT_CATALOG_URL='https://registration.awsevents.com/flow/awsevents/reinvent2026/eventcatalog/page/eventcatalog';

async function sessionAt(port){
  const base=`http://127.0.0.1:${port}`;
  try{
    const response=await fetch(`${base}/api/session`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(2500)});
    if(!response.ok)return null;
    const cookie=response.headers.get('set-cookie')?.match(/local_session=([^;]+)/)?.[1];
    const status=await response.json();
    if(!cookie||typeof status.csrf!=='string')return null;
    return {base,cookie:`local_session=${cookie}`,csrf:status.csrf,status};
  }catch{return null;}
}
async function localServer(){
  const candidates=await Promise.all(PORTS.map(sessionAt));
  return candidates.find(Boolean)||null;
}
async function api(server,path,{method='GET',body}={}){
  const headers={Accept:'application/json',Cookie:server.cookie};
  if(body!==undefined){headers['Content-Type']='application/json';headers.Origin=server.base;headers['X-CSRF-Token']=server.csrf;}
  const response=await fetch(`${server.base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof value.error==='string'?value.error:`LOCAL_API_${response.status}`);
  return value;
}
async function signedContext({catalog=true,schedule=true}={}){
  const server=await localServer();
  if(!server)throw new Error('SESSION_EXPLORER_NOT_RUNNING');
  if(!server.status.authenticated)throw new Error('SIGN_IN_REQUIRED');
  const [catalogResponse,scheduleResponse]=await Promise.all([catalog?api(server,'/api/live/catalog'):null,schedule?api(server,'/api/live/schedule'):null]);
  if(catalog&&!Array.isArray(catalogResponse.items))throw new Error('AWS_RESPONSE_INVALID');
  if(schedule&&!scheduleResponse.schedule)throw new Error('AWS_RESPONSE_INVALID');
  return {server,catalog:catalog?adaptAwsSessions(catalogResponse.items):[],catalogMeta:catalog?{complete:catalogResponse.complete,refreshing:catalogResponse.refreshing,pages:catalogResponse.pages,totalCount:catalogResponse.totalCount,error:catalogResponse.error||null}:null,schedule:schedule?scheduleResponse.schedule:null};
}
function summary(item){return {id:item.id,code:item.code,title:item.title,abstract:item.abstract,date:item.date,startTime:item.startTime,endTime:item.endTime,venue:item.venue,sessionType:item.sessionType,track:item.track,topics:item.topics};}
function searchSessions(context,{query='',date='',limit=20}={}){
  if(typeof query!=='string'||query.length>300)throw new Error('query must be a string up to 300 characters');
  if(date!==''&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)))throw new Error('date must use YYYY-MM-DD');
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('limit must be between 1 and 50');
  const needle=query.trim().normalize('NFKC').toLocaleLowerCase();
  const items=context.catalog.filter(item=>!date||item.date===date).filter(item=>!needle||[item.title,item.abstract,item.code,item.track,item.sessionType,...item.tracks,...item.topics,...item.services,...item.speakers].join(' ').normalize('NFKC').toLocaleLowerCase().includes(needle)).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||'')||a.title.localeCompare(b.title));
  return {catalog:context.catalogMeta,count:items.length,returned:Math.min(items.length,limit),sessions:items.slice(0,limit).map(summary)};
}
function scheduleSummary(context){
  const reserved=Array.isArray(context.schedule.reserved)?context.schedule.reserved.filter(id=>typeof id==='string'):[];
  const favorites=Array.isArray(context.schedule.favorites)?context.schedule.favorites.filter(id=>typeof id==='string'):[];
  const personalTime=adaptAwsPersonalTimes(Array.isArray(context.schedule.personalTime)?context.schedule.personalTime:[]);
  const byId=new Map(context.catalog.map(item=>[item.id,item]));
  return {reserved:reserved.map(id=>byId.has(id)?{...summary(byId.get(id)),reserved:true}:{id,reserved:true,title:'Session not in the current catalog'}),favoriteSessionIds:favorites,personalTime:personalTime.map(summary)};
}
function checkConflicts(context,{sessionIds}={}){
  if(!Array.isArray(sessionIds)||sessionIds.length<1||sessionIds.length>50||sessionIds.some(id=>typeof id!=='string'))throw new Error('sessionIds must contain 1 to 50 session IDs');
  const catalogById=new Map(context.catalog.map(item=>[item.id,item]));
  const reserved=new Set(Array.isArray(context.schedule.reserved)?context.schedule.reserved:[]);
  const personal=adaptAwsPersonalTimes(Array.isArray(context.schedule.personalTime)?context.schedule.personalTime:[]);
  const current=[...reserved].map(id=>catalogById.get(id)).filter(Boolean).concat(personal);
  const candidates=[...new Set(sessionIds)].map(id=>catalogById.get(id)).filter(Boolean);
  const map=conflictMap([...current,...candidates]),pairs=[],seen=new Set();
  for(const id of sessionIds){const item=catalogById.get(id);if(!item)continue;for(const other of map.get(id)||[]){if(other.id===id)continue;const key=[id,other.id].sort().join('\0');if(seen.has(key))continue;seen.add(key);pairs.push({session:summary(item),conflictsWith:summary(other),alreadyReserved:reserved.has(id)});}}
  return {checkedSessionIds:sessionIds,alreadyReservedSessionIds:sessionIds.filter(id=>reserved.has(id)),missingSessionIds:sessionIds.filter(id=>!catalogById.has(id)),conflicts:pairs};
}
const recommendationCorpus=item=>[item.title,item.abstract,item.code,item.track,item.sessionType,...(item.tracks||[]),...(item.topics||[]),...(item.services||[]),...(item.speakers||[]),...(item.industries||[]),...(item.roles||[]),...(item.keywords||[])].join(' ').normalize('NFKC').toLocaleLowerCase();
function recommendSessionsForGaps(context,{date,interests=[],dayStart='08:00',dayEnd='20:00',perSlotLimit=3}={}){
  if(!validDate(date))throw new Error('date must be a valid YYYY-MM-DD date');
  if(!Array.isArray(interests)||interests.length>RECOMMENDATION_INTERESTS.length||interests.some(id=>typeof id!=='string'||!RECOMMENDATION_INTERESTS.some(option=>option.id===id)))throw new Error(`interests must use up to ${RECOMMENDATION_INTERESTS.length} known interest IDs`);
  const start=minutes(dayStart),end=minutes(dayEnd);
  if(start===null||end===null||start>=end)throw new Error('dayStart and dayEnd must be HH:MM with dayStart before dayEnd');
  if(!Number.isInteger(perSlotLimit)||perSlotLimit<1||perSlotLimit>5)throw new Error('perSlotLimit must be between 1 and 5');

  const reservedIds=new Set(Array.isArray(context.schedule.reserved)?context.schedule.reserved.filter(id=>typeof id==='string'):[]);
  const catalogById=new Map(context.catalog.map(item=>[item.id,item]));
  const reserved=[...reservedIds].map(id=>catalogById.get(id)).filter(item=>item&&item.date===date&&validInterval(item));
  const personal=adaptAwsPersonalTimes(Array.isArray(context.schedule.personalTime)?context.schedule.personalTime:[]).filter(item=>item.date===date&&validInterval(item));
  const knownSchedule=[...reserved,...personal];
  const gaps=freeSlots(knownSchedule,start,end);
  const unresolvedReservationIds=[...reservedIds].filter(id=>{
    const item=catalogById.get(id);
    return !item||!item.date||item.date===date&&!validInterval(item);
  });
  const selected=RECOMMENDATION_INTERESTS.filter(option=>interests.includes(option.id));
  const today=new Date().toISOString().slice(0,10);
  const liveThemes=TREND_SIGNALS.filter(signal=>signal.expiresAt>=today);
  const candidates=context.catalog.filter(item=>item.date===date&&validInterval(item)&&!reservedIds.has(item.id)&&item.itemType!=='personalTime');
  const slots=gaps.map(gap=>{
    const recommendations=candidates.filter(item=>minutes(item.startTime)>=gap.start&&minutes(item.endTime)<=gap.end).map(item=>{
      const text=recommendationCorpus(item);
      const matchedInterests=selected.filter(option=>option.terms.some(term=>text.includes(term))).map(option=>({id:option.id,label:option.label}));
      const matchedThemes=liveThemes.filter(signal=>signal.terms.some(term=>text.includes(term.toLocaleLowerCase()))).map(signal=>signal.title);
      const availability=item.uiState?.availability||'unknown';
      const reasons=[];
      if(matchedInterests.length)reasons.push(`関心分野: ${matchedInterests.map(match=>match.label).join('、')}`);
      if(matchedThemes.length)reasons.push(`注目テーマ: ${matchedThemes.join('、')}`);
      if(!reasons.length)reasons.push('空き時間に収まり、既存予定と重複しません');
      return {item,matchedInterests:matchedInterests.map(match=>match.id),matchedInterestLabels:matchedInterests.map(match=>match.label),matchedThemes,recommendationReasons:reasons,availability};
    }).sort((a,b)=>b.matchedInterests.length-a.matchedInterests.length||b.matchedThemes.length-a.matchedThemes.length||({available:0,limited:1,veryLimited:2,walkUp:3,unknown:4,unavailable:5,full:6}[a.availability]??4)-({available:0,limited:1,veryLimited:2,walkUp:3,unknown:4,unavailable:5,full:6}[b.availability]??4)||minutes(a.item.startTime)-minutes(b.item.startTime)||a.item.title.localeCompare(b.item.title)).slice(0,perSlotLimit).map(match=>({...summary(match.item),reservable:match.item.reservable,availability:match.availability,matchedInterests:match.matchedInterests,matchedInterestLabels:match.matchedInterestLabels,matchedThemes:match.matchedThemes,recommendationReasons:match.recommendationReasons,officialCatalogUrl:AWS_EVENT_CATALOG_URL}));
    return {start:`${String(Math.floor(gap.start/60)).padStart(2,'0')}:${String(gap.start%60).padStart(2,'0')}`,end:`${String(Math.floor(gap.end/60)).padStart(2,'0')}:${String(gap.end%60).padStart(2,'0')}`,durationMinutes:gap.duration,recommendations};
  });
  const warnings=[];
  if(!context.catalogMeta?.complete)warnings.push('AWS session catalog is incomplete; additional sessions may be missing from these recommendations.');
  if(unresolvedReservationIds.length)warnings.push('Some AWS reservations are missing from the current catalog, so their times could not be used when calculating free slots.');
  if(context.catalogMeta?.refreshing)warnings.push('AWS session catalog is still refreshing.');
  return {date,timeZone:'America/Los_Angeles',scheduleSource:'AWS Schedule reservations and personal time',catalog:{complete:context.catalogMeta?.complete===true,totalCount:context.catalogMeta?.totalCount??null,pages:context.catalogMeta?.pages??0},coverage:{scheduleComplete:unresolvedReservationIds.length===0,knownReservations:reserved.length,unresolvedReservationIds,personalTimeBlocks:personal.length},interests:interests.map(id=>RECOMMENDATION_INTERESTS.find(option=>option.id===id)?.label),window:{start:dayStart,end:dayEnd},freeSlots:slots,warnings};
}
const tools=[
  {name:'begin_aws_sign_in',description:'Start AWS Builder ID sign-in for the local Session Explorer. Returns a URL for the user to open; it does not sign in automatically.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
  {name:'search_sessions',description:'Search the signed-in attendee’s AWS re:Invent 2026 session catalog. This reads sessions and does not change reservations or favorites.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:300},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:'get_aws_schedule',description:'Read the signed-in attendee’s AWS reservations, favorites, and personal time. This is read-only.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:'check_schedule_conflicts',description:'Check requested session IDs against the attendee’s AWS reservations and personal time. Returns missing IDs and overlapping pairs; does not change AWS data.',inputSchema:{type:'object',properties:{sessionIds:{type:'array',items:{type:'string'},minItems:1,maxItems:50}},required:['sessionIds'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:'recommend_sessions_for_gaps',description:'Find sessions that fit entirely into gaps in the signed-in attendee’s AWS Schedule for one event date. Ranks by selected interests (IDs: ai, genai, architecture, serverless, containers, security, database, saas, developer-tools), current AWS re:Invent themes, and AWS seat availability. Uses Las Vegas venue time. Read-only; does not reserve a seat. Catalog coverage and unresolved reservations are reported.',inputSchema:{type:'object',properties:{date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},interests:{type:'array',items:{type:'string',enum:RECOMMENDATION_INTERESTS.map(option=>option.id)},maxItems:RECOMMENDATION_INTERESTS.length,uniqueItems:true},dayStart:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},dayEnd:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},perSlotLimit:{type:'integer',minimum:1,maximum:5}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}}
];

async function callTool(name,args={}){
  if(name==='begin_aws_sign_in'){
    const server=await localServer();if(!server)throw new Error('SESSION_EXPLORER_NOT_RUNNING');
    const result=await api(server,'/api/auth/start',{method:'POST',body:{}});
    return {authorizationUrl:result.authorizationUrl,instructions:'Open the authorization URL in a browser, complete AWS Builder ID sign-in, then retry the tool.'};
  }
  if(name==='search_sessions')return searchSessions(await signedContext({schedule:false}),args);
  if(name==='get_aws_schedule')return scheduleSummary(await signedContext({catalog:false}));
  if(name==='check_schedule_conflicts')return checkConflicts(await signedContext(),args);
  if(name==='recommend_sessions_for_gaps')return recommendSessionsForGaps(await signedContext(),args);
  throw new Error(`Unknown tool: ${name}`);
}

function reply(id,result){process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,result})}\n`);}
function fail(id,code,message){process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})}\n`);}
async function dispatch(message){
  const {id,method,params={}}=message||{};
  if(typeof method!=='string'){if(id!==undefined)fail(id,-32600,'Invalid request');return;}
  if(method==='notifications/initialized'||method==='notifications/cancelled')return;
  if(method==='initialize'){reply(id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo});return;}
  if(method==='ping'){reply(id,{});return;}
  if(method==='tools/list'){reply(id,{tools});return;}
  if(method==='tools/call'){
    try{const data=await callTool(params.name,params.arguments||{});reply(id,{content:[{type:'text',text:JSON.stringify(data)}]});}
    catch(error){reply(id,{content:[{type:'text',text:error.message||'MCP tool failed'}],isError:true});}
    return;
  }
  if(id!==undefined)fail(id,-32601,`Method not found: ${method}`);
}

const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{const message=JSON.parse(line);void dispatch(message).catch(error=>{if(message?.id!==undefined)fail(message.id,-32603,error.message||'Internal error');});}catch{fail(null,-32700,'Parse error');}});
