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

let compactSaveNotified=0;
window.addEventListener('planner-storage-saved-without-previous',()=>compactSaveNotified++);
window.eval(html.slice(start,end));
const planner=window.PlannerData;
planner.init();
window.document.addEventListener('click',event=>{if(event.target.matches('a[download]'))blockedAtCapture=event.defaultPrevented},true);
window.document.addEventListener('click',event=>{if(event.target.matches('a[download]'))event.preventDefault()});

const first=planner.snapshot();
first.tasks.push({id:'t1',title:'Zapis mimo braku miejsca na poprzednią kopię',date:'2026-10-12',time:'',endTime:'',history:[]});
planner.commit(first);
let record=JSON.parse(stored);
assert.equal(record.previous,null,'successful quota retry must omit only the older snapshot');
assert.equal(record.data.tasks[0].title,first.tasks[0].title,'new data must be committed on quota retry');
assert.equal(planner.isLocked(),false,'successful compact retry must keep storage and sync writable');
assert.equal(planner.snapshot().tasks.length,1);
assert.equal(compactSaveNotified,1,'user should be told that the older snapshot was dropped');

let failuresLeft=2;
storage.setItem=(k,v)=>{if(failuresLeft){failuresLeft--;throw new window.DOMException('Storage full','QuotaExceededError')}if(k===key)stored=v};
const second=planner.snapshot();
second.tasks.push({id:'t2',title:'Niezapisana zmiana',date:'2026-10-13',time:'',endTime:'',history:[]});
assert.throws(()=>planner.commit(second),/Nie udało się zapisać danych/);
assert.equal(planner.isLocked(),true);
assert.equal(planner.diagnostic().stage,'write_without_previous');
assert.equal(planner.diagnostic().name,'QuotaExceededError');
assert.ok(planner.diagnostic().payloadBytes>0);
assert.equal(JSON.parse(stored).data.tasks.length,1,'both failed attempts must leave the latest successfully saved record intact');
assert.match(window.document.getElementById('dataWarning').textContent,/QuotaExceededError/);

window.document.querySelector('.app').inert=true;
window.document.body.classList.add('entry-open');
window.document.getElementById('exportBackup').click();
window.document.getElementById('exportRescue').click();
assert.equal(clicks.length,2);
assert.ok(clicks.every(click=>click.insideBackup&&!click.prevented),'locked-mode export clicks must pass the recovery guard');
assert.equal(JSON.parse(downloads[0].parts[0]).format,'moj-planer-backup');
assert.equal(JSON.parse(downloads[0].parts[0]).data.tasks[0].title,first.tasks[0].title,'ordinary backup must contain last readable data');
assert.equal(JSON.parse(downloads[1].parts[0]).format,'moj-planer-recovery');
assert.equal(JSON.parse(downloads[1].parts[0]).diagnostic.name,'QuotaExceededError');

storage.setItem=(k,v)=>{if(k===key)stored=v};
planner.restore({tasks:[{id:'saved',title:'Z kopii',date:'2026-10-14'}],ideas:[],note:'',deleteQueue:[]});
record=JSON.parse(stored);
assert.equal(record.previous,null,'restore must not duplicate the large failed snapshot');
assert.equal(record.data.tasks[0].title,'Z kopii');
assert.equal(planner.isLocked(),false);
dom.window.close();

console.log('Recovery 33.24: quota retry saves without the previous snapshot; repeated quota failure keeps recovery available.');
