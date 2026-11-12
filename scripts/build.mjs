import fs from 'node:fs';
import {createHash} from 'node:crypto';

const CHECK=process.argv.includes('--check');
const APP_VERSION='2026.11.12.33.286-integration';
const PREVIEW_VERSION='2026.11.12.33.286-test';
const PREVIEW_LABEL=PREVIEW_VERSION.split('.').slice(3).join('.').replace('-test','');
const WORKER_VERSION='2026.11.12.33.49-test';
const WORKER_LABEL='Worker 33.49-test';

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0||text.indexOf(from,first+from.length)>=0)throw Error(`Expected exactly one ${label}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
}
function output(path,content,normalize=true){
  if(normalize)content=content.replace(/\n+$/,'\n');
  if(CHECK){
    if(!fs.existsSync(path))throw Error(`Generated file is stale: ${path}. Run npm run build.`);
    const current=fs.readFileSync(path,Buffer.isBuffer(content)?undefined:'utf8');
    if(Buffer.isBuffer(content)?!current.equals(content):current!==content)throw Error(`Generated file is stale: ${path}. Run npm run build.`);
    return;
  }
  fs.mkdirSync(path.slice(0,path.lastIndexOf('/'))||'.',{recursive:true});
  fs.writeFileSync(path,content);
}

let worker=fs.readFileSync('worker.js','utf8');
for(const [name,file] of [['DIALOGUE CORE','dialogue-core.js'],['PROMPTS','prompts.js'],['BRIEF NARRATIVE','brief-narrative.js']]){
  const start=worker.indexOf('// BEGIN '+name),end=worker.indexOf('// END '+name,start);
  if(start<0||end<0)throw Error('Missing generated block '+name);
  worker=worker.slice(0,start)+'// BEGIN '+name+'\n'+fs.readFileSync(file,'utf8')+'\n'+worker.slice(end);
}
worker=worker.replace(/^\/\/ MÓJ PLANER — WORKER .*$/m,'// MÓJ PLANER — WORKER 33.49-TEST — CONVERSATION 33');
worker=worker.replace(/apiVersion:"[^"]*"/,`apiVersion:"${WORKER_VERSION}"`);
worker=worker.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";');
const workerBuildId=createHash('sha256').update(worker).digest('hex').slice(0,16);
worker=worker.replace('const BUILD_ID="development";',`const BUILD_ID="${workerBuildId}";`);

let canonical=fs.readFileSync('index.html','utf8');
canonical=canonical.replace(/Aplikacja: 2026\.\d{2}\.\d{2}\.\d+(?:\.[^ ·<]+)?/,'Aplikacja: '+APP_VERSION);
canonical=canonical.replace(/appVersion:'2026\.\d{2}\.\d{2}\.\d+(?:\.[^']+)?'/,`appVersion:'${APP_VERSION}'`);
canonical=canonical.replace(/EXPECTED_WORKER_VERSION='[^']*'/,`EXPECTED_WORKER_VERSION='${WORKER_VERSION}'`).replace(/EXPECTED_WORKER_BUILD_ID='[^']*'/,`EXPECTED_WORKER_BUILD_ID='${workerBuildId}'`);

const skyBuildId=createHash('sha256').update(fs.readFileSync('header-sky.webp')).digest('hex').slice(0,16);
canonical=canonical.replace(/header-sky\.webp(?:\?v=[a-z0-9]+)?/g,'header-sky.webp?v='+skyBuildId);
const sailboatBuildId=createHash('sha256').update(fs.readFileSync('header-sailboat.webp')).digest('hex').slice(0,16);
canonical=canonical.replace(/header-sailboat\.webp(?:\?v=[a-z0-9]+)?/g,'header-sailboat.webp?v='+sailboatBuildId);
const calendarArtDir='assets/calendar-art';
const calendarArtCatalog=JSON.parse(fs.readFileSync(calendarArtDir+'/catalog.json','utf8'));
for(const item of calendarArtCatalog.backgrounds){
  const file=calendarArtDir+'/'+item.file,content=fs.readFileSync(file),hash=createHash('sha256').update(content).digest('hex');
  if(hash!==item.sha256)throw Error('Calendar artwork and catalog differ: '+file);
  canonical=canonical.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+hash.slice(0,16));
  output('preview33/'+file,content,false);
}
output('preview33/'+calendarArtDir+'/catalog.json',fs.readFileSync(calendarArtDir+'/catalog.json'),false);
const listeningAssets=['octi-listening-body.mp4','octi-listening-head.webp','octi-listening-background.webp','octi-listening-fallback.webp','octi-listening-poster.webp','octi-actor-poster.webp','octi-actor-idle.webp'];
let listening=fs.readFileSync('octi-listening.js','utf8');
for(const file of listeningAssets){const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,16);listening=listening.replace(new RegExp(file.replace('.','\\.')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+hash);}
output('octi-listening.js',listening,false);
const listeningBuildId=createHash('sha256').update(listening).digest('hex').slice(0,16);
canonical=canonical.replace(/octi-listening\.js(?:\?v=[a-z0-9]+)?/g,'octi-listening.js?v='+listeningBuildId);
for(const file of ['octi-actor-poster.webp','octi-liquid-rim-33-181.png','octi-liquid-sphere-33-182.png','octi-glass-33-184.png','octi-caustic-33-196.svg','octi-water-glass.webp','octi-water-mascot.webp','octi-water-motion.mp4','octi-water-motion.webp','octi-water-motion-poster.webp','shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp','shopping-update-button.webp','shopping-close-x-v2.webp','shopping-purchased-note-v3.webp','weather-moon-33-219.webp','weather-icons-33-221.webp','header-autumn.webp','header-glass-lens-33-262.webp','header-glass-lens-33-263.webp','header-glass-lens-33-264.webp']){
  const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,16);
  canonical=canonical.replace(new RegExp(file.replace('.','\\.')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+hash);
}

let preview=canonical;
preview=replaceOnce(preview,'<title>Mój Planer</title>',`<title>Mój Planer — test integracji ${PREVIEW_LABEL}</title>`,'document title');
preview=replaceOnce(preview,'<h1>Mój Planer</h1>',`<h1>Mój Planer — test ${PREVIEW_LABEL}</h1><div class="card" style="margin-top:14px;border:2px solid #246bfd" role="note"><strong>Test integracji ${PREVIEW_LABEL}</strong><p>Pełny Planer generowany automatycznie z kanonicznego frontendu gałęzi integration/conversation33. Dane tej strony są odseparowane od zwykłego Planera. Google Calendar nie jest izolowany — do testów używaj konta lub kalendarza testowego.</p><a href="../">Wróć do zwykłego planera</a> · <a href="../preview32/">Wróć do testu 32.4</a></div>`,'main heading');
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
  canonical=canonical.replace(new RegExp('src="'+file.replace('.',String.fromCharCode(92)+'.')+'[^" ]*"'),'src="'+file+'?v='+buildId+'"');
  preview=preview.replace(new RegExp('src="'+file.replace('.',String.fromCharCode(92)+'.')+'[^" ]*"'),'src="'+file+'?v='+buildId+'"');
  output('preview33/'+file,content,false);
}
const travelRoutes=fs.readFileSync('travel-routes.js','utf8');
const travelRoutesBuildId=createHash('sha256').update(travelRoutes).digest('hex').slice(0,16);
canonical=canonical.replace(/travel-routes\.js(?:\?v=[a-z0-9]+)?/g,'travel-routes.js?v='+travelRoutesBuildId);
preview=preview.replace(/travel-routes\.js(?:\?v=[a-z0-9]+)?/g,'travel-routes.js?v='+travelRoutesBuildId);
output('preview33/travel-routes.js',travelRoutes,false);
const eventKeys=fs.readFileSync('event-keys.js','utf8');
const eventKeysBuildId=createHash('sha256').update(eventKeys).digest('hex').slice(0,16);
canonical=canonical.replace(/event-keys\.js(?:\?v=[a-z0-9]+)?/g,'event-keys.js?v='+eventKeysBuildId);
preview=preview.replace(/event-keys\.js(?:\?v=[a-z0-9]+)?/g,'event-keys.js?v='+eventKeysBuildId);
output('preview33/event-keys.js',eventKeys,false);
const eventWeather=fs.readFileSync('event-weather.js','utf8');
const eventWeatherBuildId=createHash('sha256').update(eventWeather).digest('hex').slice(0,16);
canonical=canonical.replace(/event-weather\.js(?:\?v=[a-z0-9]+)?/g,'event-weather.js?v='+eventWeatherBuildId);
preview=preview.replace(/event-weather\.js(?:\?v=[a-z0-9]+)?/g,'event-weather.js?v='+eventWeatherBuildId);
output('preview33/event-weather.js',eventWeather,false);
const eventDelete=fs.readFileSync('event-delete.js','utf8');
const eventDeleteBuildId=createHash('sha256').update(eventDelete).digest('hex').slice(0,16);
canonical=canonical.replace(/event-delete\.js(?:\?v=[a-z0-9]+)?/g,'event-delete.js?v='+eventDeleteBuildId);
preview=preview.replace(/event-delete\.js(?:\?v=[a-z0-9]+)?/g,'event-delete.js?v='+eventDeleteBuildId);
output('preview33/event-delete.js',eventDelete,false);


for(const file of ['day-briefing.js','brief-narrative.js','brief-holidays.js','day-briefing-ui.js','brief-event-links.js','device-permissions.js']){
  const content=fs.readFileSync(file,'utf8'),hash=createHash('sha256').update(content).digest('hex').slice(0,16);
  canonical=canonical.replace(new RegExp(file.replace('.','\\.')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+hash);
  preview=preview.replace(new RegExp(file.replace('.','\\.')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+hash);
  output('preview33/'+file,content,false);
}

// Approved background collection: keep the integration preview byte-identical.
const eventBackgroundDir='assets/event-backgrounds';
const eventBackgroundCatalog=JSON.parse(fs.readFileSync(eventBackgroundDir+'/catalog.json','utf8'));
for(const item of eventBackgroundCatalog.backgrounds){
  const content=fs.readFileSync(eventBackgroundDir+'/'+item.file);
  if(createHash('sha256').update(content).digest('hex')!==item.sha256)throw Error('Event background and catalog differ: '+item.file);
  const file=eventBackgroundDir+'/'+item.file;
  canonical=canonical.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+item.sha256.slice(0,16));
  preview=preview.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\?v=[a-z0-9]+)?','g'),file+'?v='+item.sha256.slice(0,16));
  output('preview33/'+eventBackgroundDir+'/'+item.file,content,false);
}
for(const file of ['catalog.json','index.html'])output('preview33/'+eventBackgroundDir+'/'+file,fs.readFileSync(eventBackgroundDir+'/'+file),false);

const frontendBuildId=createHash('sha256').update(preview).digest('hex').slice(0,16);
const release=JSON.stringify({version:PREVIEW_VERSION,source:'integration/conversation33/index.html',frontendBuildId,workerVersion:WORKER_VERSION,workerBuildId,protocolVersion:2},null,2)+'\n';
const workerPage=fs.readFileSync('worker-code.html','utf8').replace(/<title>Worker .*? —/,`<title>${WORKER_LABEL} —`).replace(/<h1>Worker .*?<\/h1>/,`<h1>${WORKER_LABEL}</h1>`).replace(/worker\.txt\?v=[^"']+/g,'worker.txt?v=20261112-33.49-test').replace(/download="[^"]+"/,`download="${WORKER_LABEL.replace(' ','-')}.txt"`).replace(/Pobierz Worker-[^<]+\.txt/,`Pobierz ${WORKER_LABEL.replace(' ','-')}.txt`).replace(/text\.includes\('[^']+'\)/,`text.includes('${WORKER_VERSION}')`);

output('worker.js',worker);
output('worker.txt',worker);
output('preview33/worker.txt',worker);
output('index.html',canonical);
output('preview33/index.html',preview);
output('release.json',release);
output('preview33/release.json',release);
for(const file of ['fonts/nunito-latin-variable.woff2','fonts/OFL-Nunito.txt','fonts/kalam-regular.ttf','fonts/OFL-Kalam.txt','manifest.webmanifest','app-icon-180.png','app-icon-512.png','header-sky.webp','header-sailboat.webp','octi-liquid-rim-33-181.png','octi-liquid-sphere-33-182.png','octi-glass-33-184.png','octi-caustic-33-196.svg','octi-water-glass.webp','octi-water-mascot.webp','octi-water-motion.mp4','octi-water-motion.webp','octi-water-motion-poster.webp','shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp','shopping-update-button.webp','shopping-close-x-v2.webp','shopping-purchased-note-v3.webp','weather-moon-33-219.webp','weather-icons-33-221.webp','header-autumn.webp','header-glass-lens-33-262.webp','header-glass-lens-33-263.webp','header-glass-lens-33-264.webp'])output('preview33/'+file,fs.readFileSync(file),false);
for(const file of ['octi-listening.js',...listeningAssets])output('preview33/'+file,fs.readFileSync(file),false);
output('worker-code.html',workerPage);
console.log(`${CHECK?'Checked':'Built'} ${PREVIEW_VERSION}; frontend ${frontendBuildId}; Worker ${workerBuildId}`);

