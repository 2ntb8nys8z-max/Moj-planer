import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
const settle=()=>new Promise(resolve=>w.setTimeout(resolve,250));
try{
 for(const s of w.document.querySelectorAll('script'))if(!s.src)run(s.textContent);
 const dock=w.document.querySelector('.octi-dock[data-channel=main]'),menu=dock.querySelector('.extras'),toggle=dock.querySelector('.menu-toggle');
 assert.equal(w.document.querySelectorAll('.octi-dock').length,3);
 assert.equal(dock.querySelectorAll('.voice').length,1);assert.ok(dock.querySelector('.logo').src.startsWith('data:image/png'));
 assert.ok([...menu.querySelectorAll('.extra')].every(b=>b.disabled));toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.ok([...menu.querySelectorAll('.extra')].every(b=>!b.disabled));toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
 toggle.click();dock.querySelector('.keyboard').click();assert.equal(get('manualCard').classList.contains('hidden'),false);assert.equal(w.document.activeElement,get('title'));assert.equal(run('tasks.length'),0,'opening manual create never writes an event');
 run("tasks=[{id:'e',title:'Spotkanie',date:'2026-10-13',time:'12:00',endTime:'13:00'}];openEventActions(tasks[0])");await settle();
 const eventDock=w.document.querySelector('.octi-dock[data-channel=event]');eventDock.querySelector('.menu-toggle').click();eventDock.querySelector('.keyboard').click();assert.equal(get('eventEditBox').classList.contains('hidden'),false);assert.equal(run('activeTask.id'),'e');
 eventDock.querySelector('.menu-toggle').click();eventDock.querySelector('.camera').click();assert.equal(run('ideas.length'),0,'event camera must not create a separate note');assert.equal(get('eventModal').classList.contains('hidden'),false);
 run("saveVoiceMemo=async()=>{};loadVoiceMemo=async()=>null;testBlob=new Blob(['audio'],{type:'audio/webm'});");await run("octiAttachEvent(tasks[0],testBlob,'audio')");assert.equal(run('tasks[0].attachments.length'),1);assert.equal(run('ideas.length'),0);assert.equal(get('octiEventMedia').querySelectorAll('audio').length,1);
 run('closeEventActions()');await settle();
 run("testSession=beginVoiceDialogue('main',null,null);showVoiceClarification(testSession,'Podaj godzinę')");assert.equal(get('mainClarification').querySelectorAll('button').length,2);assert.ok(get('mainClarification').querySelector('[aria-label="Wyślij odpowiedź"]'));assert.ok(get('mainClarification').querySelector('input'));assert.ok(!get('mainClarification').textContent.includes('Odpowiedz głosem'));
 run("plannerRecordings.main={mode:'opening'}");await settle();assert.equal(dock.querySelector('.status').textContent,'Uruchamiam…');assert.equal(dock.querySelector('.stage').classList.contains('recording'),false);
 run("plannerRecordings.main={mode:'recording',deadline:Date.now()+RECORDING_SECONDS*1000}");await settle();assert.match(dock.querySelector('.status').textContent,/Nagrywam · 00:/);assert.equal(dock.querySelector('.stage').classList.contains('recording'),true);
 run("plannerRecordings.main={mode:'sending'}");await settle();assert.equal(dock.querySelector('.status').textContent,'Przetwarzam…');assert.equal(get('voice').disabled,true);assert.equal(dock.querySelector('.stage').classList.contains('recording'),false);
 run('plannerRecordings.main=null');await settle();assert.equal(dock.querySelector('.status').textContent,'Naciśnij i mów');assert.equal(get('voice').disabled,false);
 console.log('Octi dock: menu, context-bound manual/photo/media actions, compact clarification, and real recorder states passed.');
}finally{dom.window.close();}
