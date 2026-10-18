import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,context=dom.getInternalVMContext(),run=source=>vm.runInContext(source,context),get=id=>w.document.getElementById(id);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
run(fs.readFileSync('sync-core.js','utf8'));
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);

try{
 w.document.querySelector('.app').inert=false;
 run(`tasks=[
  {id:'prior',title:'Poprzednie',date:'2026-10-17',time:'10:00',endTime:'11:00',people:[{name:'Anna Kowalska',email:'anna@example.com',status:'local'}]},
  {id:'current',title:'Spotkanie zespołu',date:'2026-10-18',time:'12:00',endTime:'13:00'}
 ];showPlannerWeather=async()=>{};openEventActions(tasks[1]);`);
 await settle();
 get('eventActionsToggle').click();get('actionPeople').click();await settle();
 assert.equal(get('eventPeopleModal').classList.contains('hidden'),false,'people picker opens from the event plus menu');
 assert.equal(get('eventModal').inert,true,'the event behind the picker is inert');
 assert.match(get('eventPeopleChoices').textContent,/Anna Kowalska/,'people previously used in events are reusable');
 get('eventPersonName').value='Jan Nowak';get('eventPersonEmail').value='jan@example.com';get('addEventPerson').click();
 assert.match(get('eventPeopleChoices').textContent,/Jan Nowak/);
 assert.match(get('eventPeopleSelectedCount').textContent,/1/);
 get('reviewEventPeople').click();
 assert.equal(get('eventPeopleChoose').classList.contains('hidden'),true);
 assert.match(get('eventPeopleReviewList').textContent,/Jan Nowak/);
 get('saveEventPeople').click();await settle();
 assert.equal(get('eventPeopleModal').classList.contains('hidden'),true);
 assert.equal(run(`tasks[1].people.length`),1);
 assert.equal(run(`tasks[1].people[0].status`),'local');
 assert.equal(get('eventPeopleCard').classList.contains('hidden'),false,'saved people appear in a compact event card');
 assert.match(get('eventPeopleCard').textContent,/Tylko w Okti/);

 get('editEventPeople').click();await settle();
 const anna=[...get('eventPeopleChoices').querySelectorAll('.people-row')].find(row=>row.textContent.includes('Anna Kowalska'));
 anna.querySelector('input').click();get('reviewEventPeople').click();get('prepareEventInvites').click();await settle();
 assert.equal(run(`tasks[1].people.every(person=>person.status==='ready')`),true,'choosing invitations only marks email contacts as ready and does not pretend they were sent');
 assert.match(get('toast').textContent,/Nikt nie otrzymał jeszcze wiadomości/);
 console.log('Event people 33.92: plus action, reusable contacts, multiple selection, local save, compact card and honest invitation-ready state passed.');
}finally{dom.window.close()}
