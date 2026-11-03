import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,ctx=dom.getInternalVMContext(),run=code=>vm.runInContext(code,ctx);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:query=>({matches:false,media:query,addEventListener(){},removeEventListener(){}}),confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLMediaElement.prototype.pause=function(){};

try{
  for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
  run(`selected=new Date('2026-11-02T12:00:00');ideas=[];tasks=[
    {id:'from',title:'Test lokalizacji 1',date:'2026-11-02',time:'22:00',endTime:'22:15',location:'Wyszehradzka 7, Warszawa'},
    {id:'to',title:'Test lokalizacji',date:'2026-11-02',time:'23:30',endTime:'24:00',location:'Powstańców Śląskich 109, Warszawa',travelMinutes:40}
  ];renderAll()`);
  const cue=w.document.querySelector('.phone-travel-animation');
  assert.ok(cue,'Two consecutive located events receive one animated travel cue');
  assert.equal(cue.textContent.trim(),'40 min');
  assert.equal(cue.getAttribute('aria-hidden'),'true','The repeating decorative cue is not re-announced by screen readers');
  const cueRule=[...w.document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).find(rule=>rule.selectorText==='.phone-travel-animation');
  assert.match(cueRule.style.animation,/14s/,'The cycle includes a roughly ten-second quiet pause');
  assert.match(cue.style.getPropertyValue('--travel-end-y'),/px$/);
  assert.ok(cue.querySelector('svg path'),'The cue uses a side-profile vector car rather than a pill');
  assert.equal(w.getComputedStyle(cue).backgroundColor,'rgba(0, 0, 0, 0)','No soap-shaped background remains');

  w.document.title='Mój Planer — test integracji 33.172';
  w.history.replaceState({},'',w.location.pathname+'?travelDemo=1');
  run(`tasks=[];renderAll()`);
  assert.deepEqual([...w.document.querySelectorAll('.phone-event-title-text')].map(node=>node.textContent),['Test lokalizacji 1','Test lokalizacji'],'The explicit demo link renders a visual-only event pair without requiring copied user data');
  assert.equal(w.document.querySelector('.phone-travel-animation')?.textContent.trim(),'40 min');
  assert.ok(w.document.querySelector('.phone-travel-animation.travel-demo'),'The explicit demo stays visible even when the device requests reduced motion');

  w.document.title='Mój Planer';
  w.history.replaceState({},'',w.location.pathname);

  run(`tasks=[
    {id:'from',title:'Pierwsze',date:'2026-11-02',time:'22:00',endTime:'22:15',location:'Ten sam adres'},
    {id:'to',title:'Drugie',date:'2026-11-02',time:'23:30',endTime:'24:00',location:'  TEN   SAM ADRES '}
  ];renderAll()`);
  assert.equal(w.document.querySelector('.phone-travel-animation'),null,'No trip is shown when both events use the same normalized location');
  console.log('Travel animation: side-profile car, stop, fade and quiet repeat interval verified.');
}finally{
  w.close();
}
