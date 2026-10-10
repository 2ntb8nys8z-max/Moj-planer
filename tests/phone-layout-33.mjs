import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,ctx=dom.getInternalVMContext(),run=code=>vm.runInContext(code,ctx);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
try{
for(const s of w.document.querySelectorAll('script'))if(!s.src)run(s.textContent);
assert.ok(w.document.body.classList.contains('phone-layout'));
assert.equal(w.document.querySelectorAll('#voice').length,1);assert.equal(w.document.querySelectorAll('#recordMemo').length,1);assert.equal(w.document.querySelectorAll('#createPhotoNote').length,1);
run("selected=new Date('2026-10-12T12:00:00');tasks=[{id:'a',title:'Zakupy',date:'2026-10-12',time:'13:00',endTime:'16:00'},{id:'b',title:'Spotkanie',date:'2026-10-12',time:'14:00',endTime:'15:00'},{id:'c',title:'Spacer',date:'2026-10-12',time:'16:00',endTime:'17:00'}];ideas=[{id:'r',title:'Lek',text:'Lek',alarm:{date:'2026-10-12',time:'14:30',message:'Wziąć lek'}}];renderAll()");
const result=run('phoneEventLayout(tasks,iso(selected))');assert.deepEqual(Array.from(result,e=>[e.lane,e.lanes]),[[0,2],[1,2],[0,1]]);assert.equal(w.document.querySelectorAll('.phone-event').length,3);assert.equal(w.document.querySelector('.phone-event').textContent,'Zakupy');
const bell=w.document.querySelector('.phone-bell');assert.equal(w.getComputedStyle(bell).width,'44px');assert.equal(w.getComputedStyle(bell).height,'44px');assert.match(bell.getAttribute('aria-label'),/14:30.*Wziąć lek/);assert.equal(w.document.querySelector('.phone-reminder-label').textContent,'14:30');
assert.ok(Math.abs(parseFloat(w.document.querySelector('.phone-reminder-line').style.top)-103.5)<0.01);assert.equal(w.document.querySelector('.layered').style.top,'69px');assert.equal(w.document.querySelector('.phone-reminder-line').style.zIndex,'');assert.equal(w.getComputedStyle(w.document.querySelector('.phone-reminder-line')).zIndex,'0');
bell.click();assert.match(w.document.querySelector('.phone-reminder-pop').textContent,/Wziąć lek/);w.document.querySelector('.phone-reminder-pop .close-x').click();assert.equal(w.document.querySelector('.phone-reminder-pop'),null);
w.document.querySelector('#phoneEntries').click();assert.equal(w.document.querySelector('#ideasView').classList.contains('hidden'),false);w.document.querySelector('#phoneCalendar').click();assert.equal(w.document.querySelector('#dayView').classList.contains('hidden'),false);
w.document.querySelector('.phone-add').click();assert.equal(w.document.querySelector('#manualCard').classList.contains('hidden'),false);
const overnight=run("phoneEventLayout([{id:'n',date:'2026-10-11',time:'23:00',endTime:'02:00',endDate:'2026-10-12'}],'2026-10-12')");assert.equal(overnight[0].start,0);assert.equal(overnight[0].end,120);
const before=JSON.stringify(run('tasks'));run('renderDay();showView("ideas");showView("day")');assert.equal(JSON.stringify(run('tasks')),before);
console.log('Phone skin: tabs, existing recording controls, overlaps, overnight, 44px reminder target, time connector, reminder expansion, manual form and no data mutation passed.');
}finally{dom.window.close()}
