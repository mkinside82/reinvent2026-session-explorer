import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeLanguage,resolveLanguage,setLanguage,getLanguage,LANGUAGE_KEY,t,ui,stateLabel,staticLanguageBindings} from '../src/i18n.js';
import {dateLabel,timeLabel} from '../src/ui-utils.js';
import {calendarInstant} from '../src/calendar-ics.js';
import {renderDetail,renderCard,renderComparison} from '../src/views.js';
import {normalizeSession} from '../src/session-model.js';

test('language preference overrides the browser, invalid values fall back, blocked storage remains usable',()=>{
 assert.equal(resolveLanguage('ja','en-US'),'ja');assert.equal(resolveLanguage('en','ja-JP'),'en');assert.equal(resolveLanguage('invalid','en-GB'),'en');assert.equal(resolveLanguage(null,'fr'),'ja');
 const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 initializeLanguage(storage,'en-US');assert.equal(getLanguage(),'en');setLanguage('ja',storage);assert.equal(values.get(LANGUAGE_KEY),'ja');initializeLanguage(storage,'en-US');assert.equal(getLanguage(),'ja');assert.equal(setLanguage('invalid',storage),false);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};assert.doesNotThrow(()=>initializeLanguage(blocked,'en'));assert.doesNotThrow(()=>setLanguage('ja',blocked));
});

test('template translations preserve interpolated catalog text, HTML escaping and event instants',()=>{
 const item=normalizeSession({id:'original-id',title:'会場未定 <script> · AWS original',abstract:'概要はまだ公開されていません。 <b>source text</b>',date:'2026-11-30',startTime:'08:00',endTime:'09:00',venue:'会場',level:'300',dataSource:'aws'});
 const plan=new Set([item.id]),map=new Map();setLanguage('ja');const japaneseDate=dateLabel(item.date),instant=calendarInstant(item.date,item.startTime);
 setLanguage('en');assert.notEqual(dateLabel(item.date),japaneseDate);assert.equal(calendarInstant(item.date,item.startTime),instant);assert.equal(timeLabel({}),'Time TBD');assert.equal(t('My Planはまだ空です'),'My Plan is empty');
 assert.equal(ui`会場: ${item.venue}`,'Venue: 会場');
 for(const output of [renderCard(item,plan,map,[]),renderDetail(item,plan,map),renderComparison([item,{...item,id:'second'}],plan,map)]){assert(output.includes('会場未定 &lt;script&gt; · AWS original'));assert(output.includes('概要はまだ公開されていません。 &lt;b&gt;source text&lt;/b&gt;'));assert(!output.includes('<script>'));}
 assert.equal(stateLabel('Reserved'),'Reserved');setLanguage('ja');assert.equal(dateLabel(item.date),japaneseDate);assert.equal(stateLabel('Reserved'),'予約済み');
});

test('static copy can switch repeatedly without translating newly inserted catalog values',()=>{
 const text={nodeValue:'セッション検索',parentElement:{closest:()=>false}};const root={lang:'ja'};let index=0;
 const doc={body:{},documentElement:root,createTreeWalker:()=>{index=0;return {nextNode:()=>index++===0?text:null};},querySelectorAll:()=>[]};
 setLanguage('ja');const apply=staticLanguageBindings(doc);setLanguage('en');apply();assert.equal(root.lang,'en');assert.equal(text.nodeValue,'Search sessions');setLanguage('ja');apply();assert.equal(text.nodeValue,'セッション検索');
});
