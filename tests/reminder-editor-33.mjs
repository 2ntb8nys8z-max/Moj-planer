import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,ctx=dom.getInternalVMContext(),run=code=>vm.runInContext(code,ctx),q=s=>w.document.querySelector(s);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};
const marker=(key)=>[...w.document.querySelectorAll('.phone-reminder-axis-label')].find(n=>JSON.parse(n.dataset.reminderKeys).includes(key));
const open=key=>{marker(key).click();assert(q('.phone-reminder-editor'));};
const choose=(h,m)=>{const wheels=[...w.document.querySelectorAll('.phone-reminder-wheel')];wheels[0].querySelectorAll('button')[h].click();wheels[1].querySelectorAll('button')[m].click();};
const storage=()=>run('JSON.stringify({tasks,ideas})');
try{
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 run(`selected=new Date('2026-11-05T12:00:00');tasks=[{id:'event',title:'Wziąć lek',date:'2026-11-05',time:'15:00',endTime:'15:30',reminder:{minutesBefore:15}}];ideas=[{id:'standalone',type:'idea',title:'Telefon',text:'Telefon',alarm:{date:'2026-11-05',time:'18:00',startTime:'18:00',message:'Zadzwonić',deliveredAt:'2026-11-04T18:00:00.000Z'}}];renderAll()`);
 const initial=storage(),list=q('#taskList');list.scrollTop=120;
 const animations=[];
 w.HTMLElement.prototype.animate=function(keyframes,options){const animation={element:this,keyframes,options,cancelled:false,cancel(){this.cancelled=true}};animations.push(animation);return animation;};
 open('event:event');
 assert.equal(JSON.stringify(animations.at(-1).keyframes.map(f=>Object.keys(f))),JSON.stringify([['opacity'],['opacity']]),'Reduced motion retains a gentle fade without scaling');
 assert.equal(q('.phone-reminder-editor h3').textContent,'Wziąć lek');
 assert.equal(q('.phone-reminder-offset').textContent,'15 minut wcześniej');
 assert.equal(q('.phone-reminder-wheels').children.length,3);
 assert.equal(q('.phone-reminder-wheels').textContent.includes('Godzina'),false,'No visible hour/minute labels');
 assert.equal(w.getComputedStyle(q('.phone-reminder-editor')).position,'fixed');
 assert.equal(w.getComputedStyle(q('.phone-reminder-wheel')).scrollSnapType,'y mandatory');
 choose(14,44);
 assert.equal(q('.phone-reminder-offset').textContent,'16 minut wcześniej');
 assert.equal(marker('event:event').querySelector('.phone-reminder-time').textContent,'14:44');
 assert.equal(storage(),initial,'Live preview must not mutate tasks or ideas');
 choose(14,43);assert.equal(q('.phone-reminder-offset').textContent,'17 minut wcześniej');
 q('.phone-reminder-cancel').click();
 assert.equal(storage(),initial);assert.equal(list.scrollTop,120,'Cancel restores original plan scroll');
 assert.equal(marker('event:event').querySelector('.phone-reminder-time').textContent,'14:45');
 // An hour change traverses the gap; retarget from its current visible position.
 w.matchMedia=()=>({matches:false});
 const originalRect=w.HTMLElement.prototype.getBoundingClientRect;
 let inFlightTop=null,inFlightElement=null;
 w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.classList?.contains('phone-reminder-axis-label')){const top=this===inFlightElement?inFlightTop:parseFloat(this.style.top);return {top,bottom:top+22,height:22};}return originalRect.call(this);};
 open('event:event');
 const opening=animations.at(-1);assert(opening.options.duration>=650,'Opening remains visible long enough to perceive');assert(opening.keyframes[0].transform.includes('scale('));
 choose(12,45);
 const travel=animations.at(-1);assert.equal(travel.element,marker('event:event'));assert.match(travel.keyframes[0].transform,/138px/,'Marker travels the full two-hour gap');assert(!travel.keyframes.some(f=>'opacity' in f),'Marker stays visible during travel');
 const settled=12*60*1.15+45*1.15;inFlightTop=settled+40;inFlightElement=marker('event:event');
 q('.phone-reminder-wheel').querySelectorAll('button')[11].click();
 const retarget=animations.at(-1);assert(travel.cancelled,'Superseded animation stops');assert.equal(retarget.element,marker('event:event'));assert.match(retarget.keyframes[0].transform,/109px/,'Rapid hour changes continue from the visible marker');
 const count=animations.length;q('.phone-reminder-wheel').querySelectorAll('button')[11].click();assert.equal(animations.length,count,'An unchanged rounded wheel value does not restart motion');
 q('.phone-reminder-cancel').click();assert(retarget.cancelled);assert(opening.cancelled);assert.equal(storage(),initial);
 inFlightTop=null;w.HTMLElement.prototype.getBoundingClientRect=originalRect;w.matchMedia=()=>({matches:true});
 open('event:event');choose(14,43);q('.phone-reminder-save').click();
 assert.equal(run("tasks[0].reminder.minutesBefore"),17);assert.equal(run('tasks[0].time'),'15:00','The event start is unchanged');
 assert.equal(run('JSON.parse(PlannerData.storage.getItem(TASK_KEY))[0].reminder.minutesBefore'),17);
 open('event:event');choose(16,0);assert(q('.phone-reminder-save').disabled,'Cannot schedule a before-event reminder after event start');
 q('.phone-reminder-cancel').click();
 open('event:event');choose(14,30);run("tasks[0].title='Changed elsewhere'");q('.phone-reminder-save').click();
 assert.match(q('.phone-reminder-error').textContent,/Dane zmieniły/);assert.equal(run('tasks[0].reminder.minutesBefore'),17);q('.phone-reminder-cancel').click();
 open('event:event');choose(12,0);
 const eventBefore=storage();run('savedTaskWriter=saveTasks;saveTasks=()=>{throw Error("quota")};');q('.phone-reminder-save').click();
 assert.equal(storage(),eventBefore,'A storage failure rolls back reminder/history');assert.match(q('.phone-reminder-error').textContent,/Nie udało/);run('saveTasks=savedTaskWriter');q('.phone-reminder-cancel').click();
 open('entry:standalone');choose(19,23);assert.equal(q('.phone-reminder-offset').textContent,'O godzinie 19:23');q('.phone-reminder-save').click();
 assert.equal(run('ideas[0].alarm.time'),'19:23',q('.phone-reminder-error')?.textContent);assert.equal(run('ideas[0].alarm.startTime'),'19:23');assert.equal(run('ideas[0].alarm.deliveredAt'),null);
 open('entry:standalone');choose(20,0);w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert(!q('.phone-reminder-editor'));assert.equal(run('ideas[0].alarm.time'),'19:23',q('.phone-reminder-error')?.textContent);
 // Across midnight: edit only the reminder on the selected (previous) day.
 run(`selected=new Date('2026-11-04T12:00:00');tasks=[{id:'night',title:'',date:'2026-11-05',time:'00:05',endTime:'00:30',reminder:15}];ideas=[];renderAll()`);
 open('event:night');assert.equal(q('.phone-reminder-editor h3').textContent,'Wydarzenie o 00:05');choose(23,49);assert.equal(q('.phone-reminder-offset').textContent,'16 minut wcześniej');q('.phone-reminder-save').click();assert.equal(run('tasks[0].reminder.minutesBefore'),16);assert.equal(run('tasks[0].date'),'2026-11-05');
 // Coincident reminders retain a chooser and edit only the chosen item.
 run(`selected=new Date('2026-11-05T12:00:00');tasks=[];ideas=[{id:'one',type:'idea',title:'Pierwszy',text:'Pierwszy',alarm:{date:'2026-11-05',time:'14:00'}},{id:'two',type:'idea',title:'Drugi',text:'Drugi',alarm:{date:'2026-11-05',time:'14:00'}}];renderAll()`);
 marker('entry:one').click();assert(q('.phone-reminder-pop'));q('.phone-reminder-pop .secondary').click();choose(13,50);q('.phone-reminder-save').click();assert.equal(run('ideas[0].alarm.time'),'13:50');assert.equal(run('ideas[1].alarm.time'),'14:00');
 // Use actual renderer and scroll container with synthetic browser rectangles.
 list.getBoundingClientRect=()=>({top:200,bottom:600,height:400});let targetScroll=null;list.scrollTo=({top})=>{targetScroll=top;list.scrollTop=top;};
 open('entry:one');choose(12,0);const moving=marker('entry:one');moving.getBoundingClientRect=()=>({top:150,bottom:172,height:22});
 const wheel=q('.phone-reminder-wheel');wheel.scrollTop=11*40;wheel.dispatchEvent(new w.Event('scroll'));await new Promise(resolve=>w.setTimeout(resolve,25));
 // The marker was recreated; measure the new one and run a further real wheel click.
 const proto=w.HTMLElement.prototype.getBoundingClientRect;
 w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.classList?.contains('phone-reminder-axis-label'))return {top:100,bottom:122,height:22};return proto.call(this);};
 q('.phone-reminder-wheel').querySelectorAll('button')[10].click();assert.notEqual(targetScroll,null,'Moving outside the visible plan triggers scroll following');
 assert(q('.phone-reminder-editor'),'The editor remains open while the plan follows');
 w.HTMLElement.prototype.getBoundingClientRect=proto;q('.phone-reminder-cancel').click();
 console.log('Reminder editor: event-relative live preview, independent wheels, persistence, rollback, stale-data rejection, midnight, groups, standalone alarms, cancel/scroll restoration and plan following passed (DOM geometry simulated).');
}finally{dom.window.close()}
