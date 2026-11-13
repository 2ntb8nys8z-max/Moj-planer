import fs from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://2ntb8nys8z-max.github.io/Moj-planer/brief-preview/',dir='test-artifacts/brief-preview/',release=JSON.parse(fs.readFileSync(dir+'release.json','utf8')),hash=v=>createHash('sha256').update(v).digest('hex');
for(let attempt=0;attempt<20;attempt++){
 try{for(const file of ['release.json','index.html','day-briefing.js','brief-inspiration-data.js','brief-inspiration.js','brief-narrative.js','brief-holidays.js','brief-day-card.js','day-briefing-ui.js','brief-event-links.js','travel-routes.js']){const response=await fetch(base+file+'?verify='+release.frontendBuildId,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==hash(fs.readFileSync(dir+file)))throw Error('Oczekiwanie na '+file)}console.log('Zweryfikowano działający podgląd: '+base);break}
 catch(e){if(attempt===19)throw e;await new Promise(r=>setTimeout(r,15000))}
}
