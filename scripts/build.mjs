import fs from 'node:fs';
import {createHash} from 'node:crypto';

const CHECK=process.argv.includes('--check');
const APP_VERSION='2026.10.10.33.23-integration';
const PREVIEW_VERSION='2026.10.10.33.23-test';
const WORKER_VERSION='2026.10.10.33.22-test';
const WORKER_LABEL='Worker 33.22-test';

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0||text.indexOf(from,first+from.length)>=0)throw Error(`Expected exactly one ${label}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
}
function output(path,content,normalize=true){
  if(normalize)content=content.replace(/\n+$/,'\n');
  if(CHECK){
    if(!fs.existsSync(path)||fs.readFileSync(path,'utf8')!==content)throw Error(`Generated file is stale: ${path}. Run npm run build.`);
    return;
  }
  fs.mkdirSync(path.slice(0,path.lastIndexOf('/'))||'.',{recursive:true});
  fs.writeFileSync(path,content);
}

let worker=fs.readFileSync('worker.js','utf8');
for(const [name,file] of [['DIALOGUE CORE','dialogue-core.js'],['PROMPTS','prompts.js']]){
  const start=worker.indexOf('// BEGIN '+name),end=worker.indexOf('// END '+name,start);
  if(start<0||end<0)throw Error('Missing generated block '+name);
  worker=worker.slice(0,start)+'// BEGIN '+name+'\n'+fs.readFileSync(file,'utf8')+'\n'+worker.slice(end);
}
worker=worker.replace(/^\/\/ MÓJ PLANER — WORKER .*$/m,'// MÓJ PLANER — WORKER 33.22-TEST — CONVERSATION 33');
worker=worker.replace(/apiVersion:"[^"]*"/,`apiVersion:"${WORKER_VERSION}"`);
worker=worker.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";');
const workerBuildId=createHash('sha256').update(worker).digest('hex').slice(0,16);
worker=worker.replace('const BUILD_ID="development";',`const BUILD_ID="${workerBuildId}";`);

let canonical=fs.readFileSync('index.html','utf8');
canonical=canonical.replace(/Aplikacja: 2026\.10\.\d{2}\.\d+(?:\.[^ ·<]+)?/,'Aplikacja: '+APP_VERSION);
canonical=canonical.replace(/appVersion:'2026\.10\.\d{2}\.\d+(?:\.[^']+)?'/,`appVersion:'${APP_VERSION}'`);
canonical=canonical.replace(/EXPECTED_WORKER_VERSION='[^']*'/,`EXPECTED_WORKER_VERSION='${WORKER_VERSION}'`).replace(/EXPECTED_WORKER_BUILD_ID='[^']*'/,`EXPECTED_WORKER_BUILD_ID='${workerBuildId}'`);

let preview=canonical;
preview=replaceOnce(preview,'<title>Mój Planer</title>','<title>Mój Planer — test integracji 33.23</title>','document title');
preview=replaceOnce(preview,'<h1>Mój Planer</h1>','<h1>Mój Planer — test 33.23</h1><div class="card" style="margin-top:14px;border:2px solid #246bfd" role="note"><strong>Test integracji 33.23</strong><p>Pełny Planer generowany automatycznie z kanonicznego frontendu gałęzi integration/conversation33. Dane tej strony są odseparowane od zwykłego Planera. Google Calendar nie jest izolowany — do testów używaj konta lub kalendarza testowego.</p><a href="../">Wróć do zwykłego planera</a> · <a href="../preview32/">Wróć do testu 32.4</a></div>','main heading');
preview=preview.replaceAll(APP_VERSION,PREVIEW_VERSION);
preview=replaceOnce(preview,'// Durable planner state: one atomic record, one previous good snapshot.',"// Durable planner state: one atomic record, one previous good snapshot.\nconst PREVIEW33_PREFIX='planner-preview-33:';\nconst PREVIEW33_STORE={key:key=>PREVIEW33_PREFIX+key,getItem:key=>window.localStorage.getItem(PREVIEW33_PREFIX+key),setItem:(key,value)=>window.localStorage.setItem(PREVIEW33_PREFIX+key,value),removeItem:key=>window.localStorage.removeItem(PREVIEW33_PREFIX+key)};",'storage adapter insertion');
const plannerStart=preview.indexOf('const PlannerData=(()=>{');
const plannerEnd=preview.indexOf('window.PlannerData=PlannerData;',plannerStart);
if(plannerStart<0||plannerEnd<0)throw Error('Cannot locate PlannerData block');
let planner=preview.slice(plannerStart,plannerEnd);
planner=planner.replaceAll('localStorage.getItem(','PREVIEW33_STORE.getItem(').replaceAll('localStorage.setItem(','PREVIEW33_STORE.setItem(').replaceAll('localStorage.removeItem(','PREVIEW33_STORE.removeItem(').replace('e.key===KEY','e.key===PREVIEW33_STORE.key(KEY)');
preview=preview.slice(0,plannerStart)+planner+preview.slice(plannerEnd);
for(const file of ['sync-core.js','google-calendar.js']){
  const content=fs.readFileSync(file,'utf8'),buildId=createHash('sha256').update(content).digest('hex').slice(0,16);
  preview=preview.replace(new RegExp('src="'+file.replace('.',String.fromCharCode(92)+'.')+'[^" ]*"'),'src="'+file+'?v='+buildId+'"');
  output('preview33/'+file,content,false);
}

const frontendBuildId=createHash('sha256').update(preview).digest('hex').slice(0,16);
const release=JSON.stringify({version:PREVIEW_VERSION,source:'integration/conversation33/index.html',frontendBuildId,workerVersion:WORKER_VERSION,workerBuildId,protocolVersion:2},null,2)+'\n';
const workerPage=fs.readFileSync('worker-code.html','utf8').replace(/<title>Worker .*? —/,`<title>${WORKER_LABEL} —`).replace(/<h1>Worker .*?<\/h1>/,`<h1>${WORKER_LABEL}</h1>`).replace(/worker\.txt\?v=[^"']+/g,'worker.txt?v=20261010-33.22-test').replace(/download="[^"]+"/,`download="${WORKER_LABEL.replace(' ','-')}.txt"`).replace(/Pobierz Worker-[^<]+\.txt/,`Pobierz ${WORKER_LABEL.replace(' ','-')}.txt`).replace(/text\.includes\('[^']+'\)/,`text.includes('${WORKER_VERSION}')`);

output('worker.js',worker);
output('worker.txt',worker);
output('preview33/worker.txt',worker);
output('index.html',canonical);
output('preview33/index.html',preview);
output('release.json',release);
output('preview33/release.json',release);
output('worker-code.html',workerPage);
console.log(`${CHECK?'Checked':'Built'} ${PREVIEW_VERSION}; frontend ${frontendBuildId}; Worker ${workerBuildId}`);
