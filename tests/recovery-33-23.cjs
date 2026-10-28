const fs=require('node:fs');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync('preview33/index.html','utf8');
const start=html.indexOf("const PREVIEW33_PREFIX='planner-preview-33:';");
const end=html.indexOf('window.PlannerData=PlannerData;',start)+'window.PlannerData=PlannerData;'.length;
assert.ok(start>=0&&end>start,'Preview must contain its storage/recovery module');

const dom=new JSDOM('<!doctype html><body><div class="app"><div id="ideaModal" class="modal-backdrop"></div><section id="backupCard"><div id="dataWarning" hidden></div><button id="exportBackup"></button><button id="exportRescue"></button><button id="exportPrevious"></button><button id="importBackup"></button><input id="backupFile"><textarea id="note"></textarea></section></div></body>',{url:'https://planner.test',runScripts:'outside-only'});
const {window}=dom;
window.structuredClone=structuredClone;
window.HTMLElement.prototype.scrollIntoView=()=>{};
window.iso=d=>new Date(d).toISOString().slice(0,10);
window.alert=()=>{};
window.confirm=()=>true;
window.Blob=class CapturedBlob{constructor(parts){this.parts=parts;this.size=parts.join('').length}};

const key='planner-preview-33:moj-planer-data-v1';
const initial={tasks:[],ideas:[],note:'',deleteQueue:[]};
let stored=JSON.stringify({version:1,data:initial,previous:null,savedAt:'2026-10-10T00:00:00Z'});
let writeFailures=1;
const storage={getItem:k=>k===key?stored:null,setItem:(k,v)=>{if(writeFailures){writeFailures--;throw new window.DOMException('Storage full','QuotaExceededError')}if(k===key)stored=v},removeItem:()=>{}};
Object.defineProperty(window,'localStorage',{value:storage,configurable:true});

const downloads=[];
window.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test-'+downloads.length};
window.URL.revokeObjectURL=()=>{};
const clicks=[];
let blockedAtCapture=null;
window.HTMLAnchorElement.prototype.click=function(){
  const event=new window.MouseEvent('click',{bubbles:true,cancelable:true});
  this.dispatchEvent(event);
  clicks.push({insideBackup:!!this.closest('#backupCard'),prevented:blockedAtCapture});
};

window.eval(html.slice(start,end));
const planner=window.PlannerData;
planner.init();
window.document.addEventListener('click',event=>{if(event.target.matches('a[download]'))blockedAtCapture=event.defaultPrevented},true);
window.document.addEventListener('click',event=>{if(event.target.matches('a[download]'))event.preventDefault()});
window.document.querySelector('.app').inert=true;
window.document.body.classList.add('entry-open');
const next=planner.snapshot();
next.tasks.push({id:'t1',title:'Nowe wydarzenie',date:'2026-10-12',time:'',endTime:'',history:[]});
assert.throws(()=>planner.commit(next),/Nie udało się zapisać danych/);
assert.equal(planner.isLocked(),true);
assert.equal(planner.diagnostic().stage,'write');
assert.equal(planner.diagnostic().name,'QuotaExceededError');
assert.ok(planner.diagnostic().payloadBytes>0);
assert.equal(window.document.querySelector('.app').inert,false);
assert.equal(window.document.body.classList.contains('entry-open'),false);
assert.match(window.document.getElementById('dataWarning').textContent,/QuotaExceededError/);

window.document.getElementById('exportBackup').click();
window.document.getElementById('exportRescue').click();
assert.equal(clicks.length,2);
assert.ok(clicks.every(click=>click.insideBackup&&!click.prevented),'locked-mode export clicks must pass the recovery guard');
assert.equal(JSON.parse(downloads[0].parts[0]).format,'moj-planer-backup');
assert.equal(JSON.parse(downloads[0].parts[0]).data.tasks.length,0,'ordinary backup must contain the last readable state');
assert.equal(JSON.parse(downloads[1].parts[0]).format,'moj-planer-recovery');
assert.equal(JSON.parse(downloads[1].parts[0]).diagnostic.name,'QuotaExceededError');

planner.restore({tasks:[{id:'saved',title:'Z kopii',date:'2026-10-13'}],ideas:[],note:'',deleteQueue:[]});
const restored=JSON.parse(stored);
assert.equal(restored.previous,null,'restore must not duplicate the large failed snapshot');
assert.equal(restored.data.tasks[0].title,'Z kopii');
assert.equal(planner.isLocked(),false);
dom.window.close();

console.log('Recovery 33.23: export works while locked, diagnosis is preserved, and restore avoids duplicating old data.');
