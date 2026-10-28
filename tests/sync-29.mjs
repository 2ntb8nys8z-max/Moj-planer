import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
await import('../sync-core.js');const core=globalThis.PlannerSyncCore;
const remote=(title='A',location='Warszawa')=>({id:'event1',summary:title,description:'',location,etag:'"v1"',start:{dateTime:'2026-10-06T13:00:00+02:00',timeZone:'Europe/Warsaw'},end:{dateTime:'2026-10-06T13:15:00+02:00',timeZone:'Europe/Warsaw'}});
const original=remote();let calls=[];
const c={console,Date,Intl,URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:webcrypto,PlannerSyncCore:core,window:{},localStorage:{getItem:()=>null,setItem(){}},tasks:[],saveTasks(){},renderAll(){},toast(){},setGoogleStatus(){},plannerDescription:t=>t.notes||'',fetch:async()=>{throw Error('unexpected network')},escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{getElementById(){return null}}};
vm.createContext(c);const source=fs.readFileSync('google-calendar.js','utf8');vm.runInContext(source.slice(0,source.indexOf('for(const task of tasks){\n  const baseline')),c);vm.runInContext("googleAccessToken='test'",c);
const task=()=>({id:1,googleEventId:'event1',source:'google',title:'A',date:'2026-10-06',time:'13:00',endTime:'13:15',endDate:'2026-10-06',timeZone:'Europe/Warsaw',notes:'',location:'Warszawa',googleDirty:true,googleDeleteBaseline:c.googleComparableDeleteContent(original)});
const response=x=>({ok:true,status:200,json:async()=>x});
let t=task();t.title='B';c.tasks=[t];
c.plannerGoogleFetch=async(u,o)=>{calls.push(o);return response(o.method==='PATCH'?{...remote('A','Łódź'),...JSON.parse(o.body),etag:'"v2"'}:remote('A','Łódź'))};
assert.equal(await c.pushEditedTaskToGoogle(t),true);const patch=JSON.parse(calls[1].body);assert.deepEqual(patch,{summary:'B'});assert.equal(calls[1].headers['If-Match'],'"v1"');assert.equal(t.location,'Łódź');assert.equal(t.googleDirty,false);
// Conflicting edits to the same field never send PATCH.
t=task();t.title='B';c.tasks=[t];calls=[];c.plannerGoogleFetch=async(u,o)=>{calls.push(o);return response(remote('C'))};assert.equal(await c.pushEditedTaskToGoogle(t),false);assert.equal(t.googleConflict,'edited');assert.equal(calls.length,1);
// A delayed response acknowledges only what was sent.
t=task();t.title='B';c.tasks=[t];let release;
c.plannerGoogleFetch=async(u,o)=>o.method==='PATCH'?await new Promise(r=>release=()=>r(response({...remote('B'),etag:'"v2"'}))):response(original);
const pending=c.pushEditedTaskToGoogle(t);while(!release)await new Promise(r=>setImmediate(r));t.title='C';release();assert.equal(await pending,false);assert.equal(t.title,'C');assert.equal(t.googleDirty,true);
// Never accept a different end returned by Google.
t=task();t.title='B';c.tasks=[t];c.plannerGoogleFetch=async(u,o)=>response(o.method==='PATCH'?{...remote('B'),end:{dateTime:'2026-10-06T15:00:00+02:00'}}:original);assert.equal(await c.pushEditedTaskToGoogle(t),false);assert.equal(t.googleDirty,true);
// Preserve multi-day all-day and timed ranges when changing only a title.
for(const event of [{...original,start:{date:'2026-10-06'},end:{date:'2026-10-10'}},{...original,end:{dateTime:'2026-10-09T14:00:00+02:00',timeZone:'Europe/Warsaw'}}]){
 const p=core.parts(event),local={...task(),...p,title:'B'};const out=core.merge(event,c.googleEditPatch(local),event);assert.deepEqual(out.patch,{summary:'B'});
}
// Explicit notification policy.
assert.deepEqual(JSON.parse(JSON.stringify(c.googleEventBody({...task(),reminder:{minutesBefore:15}}).reminders)),{useDefault:false,overrides:[]});assert.equal('reminders' in c.googleEditPatch(task()),false);
// Stale import must not replace the common baseline.
t=task();t.title='B';c.tasks=[t];c.googleDeleteQueue=()=>[];c.googleEventStoppedLocally=()=>false;c.queuedGoogleSeriesDeletion=()=>false;const baseline=JSON.stringify(t.googleDeleteBaseline);c.upsertGoogleEvent(remote('C'));assert.equal(JSON.stringify(t.googleDeleteBaseline),baseline);
// Valid conversions and local-zone preservation; nonexistent spring clock is rejected.
assert.equal(core.parts(original).time,'13:00');assert.throws(()=>core.instant('2026-03-29','02:30','Europe/Warsaw'));
const all=core.body({...task(),time:'',endTime:'',endDate:'2026-10-07'},'');assert.equal(all.start.date,'2026-10-06');assert.equal(all.end.date,'2026-10-07');
const midnight=core.body({...task(),time:'23:00',endTime:'00:00',endDate:'2026-10-07'},'');assert.deepEqual(core.parts({start:midnight.start,end:midnight.end}),{date:'2026-10-06',time:'23:00',endDate:'2026-10-07',endTime:'00:00',timeZone:'Europe/Warsaw',allDay:false});
console.log('Sync 29: disjoint merge, conflict, ETag, stale reply, full verification, multi-day, reminders, baseline, time zone passed.');

// Creation retry keeps the original payload and never acknowledges a later edit.
t={...task(),source:'planner',googleEventId:null,googleCreateId:'mp123'};c.tasks=[t];let createdBody;
c.plannerGoogleFetch=async(u,o)=>{createdBody=JSON.parse(o.body);return await new Promise(r=>release=()=>r(response({...createdBody,etag:'"created"'})))};
release=null;const creating=c.sendTaskToGoogle(t,true);while(!release)await new Promise(r=>setImmediate(r));t.title='After send';release();await creating;
assert.equal(t.googleEventId,'mp123');assert.equal(t.title,'After send');assert.equal(t.googleDirty,true);assert.equal(t.googleSynced,false);
t={...task(),source:'planner',googleEventId:null,googleCreateId:'mp456'};c.tasks=[t];let attempts=0;
c.plannerGoogleFetch=async(u,o)=>{attempts++;if(attempts===1){createdBody=JSON.parse(o.body);return {ok:false,status:409}}return response({...createdBody,etag:'"existing"'})};
assert.equal(await c.sendTaskToGoogle(t,true),true);assert.equal(attempts,2);assert.equal(t.googleEventId,'mp456');assert.equal(t.googleSynced,true);
console.log('Creation: stale acknowledgement and idempotent 409 retry passed.');
