import {normalizeSession} from './session-model.js';
/** Demo-provider adapter. Legacy start/end/type fields are mapped only here.
 * Phase 2: implement a server-backed provider returning Application Sessions.
 * AWS response mapping, pagination and tokens must live behind that boundary.
 */
export function adaptDemoData(raw) {
  if (!Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
  const seen=new Set();
  return raw.map(row=>normalizeSession({...row,startTime:row?.startTime??row?.start,endTime:row?.endTime??row?.end,sessionType:row?.sessionType??row?.type,dataSource:'demo'})).filter(s=>{if(!s || seen.has(s.id))return false;seen.add(s.id);return true;});
}
const list=value=>Array.isArray(value)?value:[];
function sessionEnd(start,length){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start||'')||!/^[1-9]\d{0,3}$/.test(String(length??'')))return '';
  const total=Number(start.slice(0,2))*60+Number(start.slice(3))+Number(length);
  if(total<=0||total>24*60)return '';
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function partsInZone(epoch,zone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch));
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function localDateTimeEpoch(date,time,zone){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))return null;
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),desired=Date.UTC(year,month-1,day,hour,minute);
  let candidate=desired;
  for(let i=0;i<5;i++){
    const p=partsInZone(candidate,zone),represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
    const adjustment=desired-represented;if(!adjustment)break;candidate+=adjustment;
  }
  const check=partsInZone(candidate,zone);
  return Number(check.year)===year&&Number(check.month)===month&&Number(check.day)===day&&Number(check.hour)===hour&&Number(check.minute)===minute?candidate:null;
}
export function venueLocalDateTimeToUtc(date,time){const epoch=localDateTimeEpoch(date,time,'America/Los_Angeles');return epoch===null?null:new Date(epoch).toISOString().slice(0,19);}
function venueLocalTime(time){
  const date=typeof time.date==='string'?time.date:'',start=typeof time.time==='string'?time.time:'',length=typeof time.length==='string'?time.length:'';
  const timezone=typeof time.timezone==='string'?time.timezone:'';
  const original={date,time:start,length,timezone};
  if(!timezone)return {date,startTime:start,endTime:sessionEnd(start,length),sourceTime:original,displayTimeZone:''};
  try{
    const startEpoch=localDateTimeEpoch(date,start,timezone);if(startEpoch===null)return {date,startTime:start,endTime:sessionEnd(start,length),sourceTime:original,displayTimeZone:'timezone-unavailable'};
    const localStart=partsInZone(startEpoch,'America/Los_Angeles'),localDate=`${localStart.year}-${localStart.month}-${localStart.day}`,localStartTime=`${localStart.hour}:${localStart.minute}`;
    let endTime='';
    if(/^[1-9]\d{0,3}$/.test(length)){
      const end=partsInZone(startEpoch+Number(length)*60000,'America/Los_Angeles');
      if(`${end.year}-${end.month}-${end.day}`===localDate)endTime=`${end.hour}:${end.minute}`;
    }
    return {date:localDate,startTime:localStartTime,endTime,sourceTime:original,displayTimeZone:'America/Los_Angeles'};
  }catch{return {date,startTime:start,endTime:sessionEnd(start,length),sourceTime:original,displayTimeZone:'timezone-unavailable'};}
}
/** Maps only fields defined by the AWS Events OpenAPI Session schema. */
export function normalizeAwsSession(row){
  if(!row||typeof row!=='object'||typeof row.sessionId!=='string'||!row.sessionId.trim())return null;
  const time=row.sessionTime&&typeof row.sessionTime==='object'?row.sessionTime:{};
  const local=venueLocalTime(time);
  const level=typeof row.level==='string'?row.level:'';
  const availability={available:'available',limited:'limited',veryLimited:'veryLimited',unavailable:'unavailable',walkUp:'walkUp'}[row.seatAvailability]||'unknown';
  const speakers=list(row.speakers).map(s=>typeof s==='string'?s:s?.name).filter(v=>typeof v==='string');
  return normalizeSession({
    id:row.sessionId,code:row.abbreviation,title:row.title,abstract:row.abstract,
    date:local.date,startTime:local.startTime,endTime:local.endTime,
    sessionType:row.type,level,levelLabel:level,track:list(row.tracks)[0]||'',tracks:row.tracks,
    topics:[...list(row.topics),...list(row.areasOfInterest)],industries:row.industries,
    roles:[...list(row.roles),...list(row.customerPersonas)],services:row.services,
    speakers,venue:row.venue,room:row.room,
    keywords:[...list(row.segments),...list(row.features),...list(row.experiences),...list(row.additionalActivities),...list(row.focusAreas)],
    reservable:typeof row.isReservable==='boolean'?row.isReservable:null,dataSource:'aws',
    sourceTime:local.sourceTime,displayTimeZone:local.displayTimeZone,
    uiState:{availability,attendance:'none'}
  });
}
export function adaptAwsSessions(raw){
  if(!Array.isArray(raw))throw new Error('INVALID_RESPONSE');
  const seen=new Set();
  return raw.map(normalizeAwsSession).filter(s=>{if(!s||seen.has(s.id))return false;seen.add(s.id);return true;});
}
/** Maps AWS Schedule personal-time blocks from UTC into the venue's local time. */
export function adaptAwsPersonalTimes(raw){
  if(!Array.isArray(raw))throw new Error('INVALID_RESPONSE');
  const seen=new Set();
  return raw.map(row=>{
    if(!row||typeof row!=='object'||typeof row.personalTimeId!=='string'||!row.personalTimeId.trim())return null;
    const start=row.startDateTime,end=row.endDateTime,valid=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value)&&!Number.isNaN(Date.parse(`${value}Z`));
    if(!valid(start)||!valid(end))return null;
    const startEpoch=Date.parse(`${start}Z`),endEpoch=Date.parse(`${end}Z`);if(endEpoch<=startEpoch)return null;
    const localStart=partsInZone(startEpoch,'America/Los_Angeles'),localEnd=partsInZone(endEpoch,'America/Los_Angeles'),sameDate=localStart.year===localEnd.year&&localStart.month===localEnd.month&&localStart.day===localEnd.day;
    const id=`aws-personal:${row.personalTimeId}`;if(seen.has(id))return null;seen.add(id);
    const item=normalizeSession({id,code:'PERSONAL',title:typeof row.title==='string'?row.title:'Personal time',abstract:typeof row.description==='string'?row.description:'',date:`${localStart.year}-${localStart.month}-${localStart.day}`,startTime:`${localStart.hour}:${localStart.minute}`,endTime:sameDate?`${localEnd.hour}:${localEnd.minute}`:'',sessionType:'Personal time',venue:typeof row.location==='string'?row.location:'',dataSource:'aws-personal-time',itemType:'personalTime',uiState:{personalTime:true}});
    return item?{...item,personalTimeId:row.personalTimeId,sourceStartDateTime:start,sourceEndDateTime:end}:null;
  }).filter(Boolean);
}
export function normalizeSideEvent(row){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||typeof row.title!=='string'||typeof row.sourceUrl!=='string'||!row.sourceUrl.startsWith('https://'))return null;
  const date=typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'';
  if(row.timingStatus&&!['confirmed','tentative','unknown'].includes(row.timingStatus))return null;
  const item=normalizeSession({id:`side:${row.id}`,title:row.title,abstract:row.description,code:'EVENT',date,startTime:row.startTime||'',endTime:row.endTime||'',sessionType:'Side event',level:'',levelLabel:'No technical level',venue:row.venue||'',topics:row.category?[row.category]:[],dataSource:'official-side-event',itemType:'sideEvent'});
  if(!item)return null;
  return {...item,category:typeof row.category==='string'?row.category:'',startsAt:typeof row.startsAt==='string'?row.startsAt:'',endsAt:typeof row.endsAt==='string'?row.endsAt:'',timezone:typeof row.timezone==='string'?row.timezone:'',sourceUrl:row.sourceUrl,sourceName:typeof row.sourceName==='string'?row.sourceName:'',verifiedAt:typeof row.verifiedAt==='string'?row.verifiedAt:'',registrationUrl:typeof row.registrationUrl==='string'?row.registrationUrl:'',registrationRequired:typeof row.registrationRequired==='boolean'?row.registrationRequired:null,timingStatus:row.timingStatus||'unknown'};
}
export function adaptSideEvents(raw){
  if(!Array.isArray(raw))throw new Error('INVALID_RESPONSE');
  const seen=new Set();
  return raw.map(normalizeSideEvent).filter(item=>{if(!item||seen.has(item.id))return false;seen.add(item.id);return true;});
}
export const demoProvider={
  async listSessions({signal}={}) {
    const response=await fetch('./sessions.demo.json',{signal,cache:'no-cache'});
    if(!response.ok) throw new Error('FETCH_FAILED');
    return adaptDemoData(await response.json());
  }
};
export function createSessionRepository(provider) {
  if(typeof provider?.listSessions!=='function')throw new Error('Invalid session provider');
  return {listSessions:options=>provider.listSessions(options)};
}
export const sessionRepository=createSessionRepository(demoProvider);
export const sideEventRepository={async listSideEvents({signal}={}){const response=await fetch('./side-events.verified.json',{signal,cache:'no-cache'});if(!response.ok)throw new Error('SIDE_EVENT_FETCH_FAILED');return adaptSideEvents(await response.json());}};

let csrfToken='';
async function apiRequest(path,{method='GET',body,signal}={}){
  const headers={Accept:'application/json'};
  if(body!==undefined){headers['Content-Type']='application/json';headers['X-CSRF-Token']=csrfToken;}
  const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal,credentials:'same-origin',cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(typeof result.error==='string'?result.error:'LOCAL_API_ERROR');error.status=response.status;throw error;}
  return result;
}
export async function localSessionStatus(){
  const result=await apiRequest('/api/session');
  if(typeof result.csrf!=='string'||typeof result.authenticated!=='boolean')throw new Error('LOCAL_API_UNAVAILABLE');
  csrfToken=result.csrf;
  return result;
}
export async function startBuilderIdSignIn(){const result=await apiRequest('/api/auth/start',{method:'POST',body:{}});if(typeof result.authorizationUrl!=='string')throw new Error('LOCAL_API_ERROR');return result.authorizationUrl;}
export async function signOutAws(){const result=await apiRequest('/api/auth/logout',{method:'POST',body:{}});return result.logoutUrl;}
export async function requestCatalogRefresh(){return apiRequest('/api/live/catalog/refresh',{method:'POST',body:{}});}
export async function fetchLiveCatalog({signal}={}){
  const snapshot=await apiRequest('/api/live/catalog',{signal});
  return {...snapshot,sessions:adaptAwsSessions(snapshot.items)};
}
export async function fetchLiveSchedule(){return apiRequest('/api/live/schedule');}
export async function reserveLiveSessions(sessionIds){return apiRequest('/api/live/reservations',{method:'POST',body:{sessionIds}});}
export async function cancelLiveReservations(sessionIds){return apiRequest('/api/live/reservations/cancel',{method:'POST',body:{sessionIds}});}
export async function saveLivePersonalTime(input){return apiRequest('/api/live/personal-time',{method:'POST',body:input});}
export async function googleCalendarStatus(){return apiRequest('/api/google/status');}
export async function configureGoogleCalendar(clientId){return apiRequest('/api/google/configure',{method:'POST',body:{clientId}});}
export async function connectGoogleCalendar(){return apiRequest('/api/google/connect',{method:'POST',body:{}});}
export async function syncGoogleCalendar(items){return apiRequest('/api/google/sync',{method:'POST',body:{items}});}
export async function removeGoogleCalendarItems(itemIds){return apiRequest('/api/google/remove',{method:'POST',body:{itemIds}});}
