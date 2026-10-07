import fs from 'node:fs';import {createHash} from 'node:crypto';
const VERSION='2026.10.07.33.2-test',WORKER_LABEL='Worker 33.2-test';
let worker=fs.readFileSync('worker.js','utf8');
for(const [name,file] of [['DIALOGUE CORE','dialogue-core.js'],['PROMPTS','prompts.js']]){
 const start=worker.indexOf('// BEGIN '+name),end=worker.indexOf('// END '+name,start);
 if(start<0||end<0)throw Error('Missing generated block '+name);
 worker=worker.slice(0,start)+'// BEGIN '+name+'\n'+fs.readFileSync(file,'utf8')+'\n'+worker.slice(end);
}
worker=worker.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";');
const id=createHash('sha256').update(worker).digest('hex').slice(0,16);
worker=worker.replace('const BUILD_ID="development";',`const BUILD_ID="${id}";`);
fs.writeFileSync('worker.js',worker);fs.writeFileSync('worker.txt',worker);
fs.writeFileSync('release.json',JSON.stringify({version:VERSION,protocolVersion:2,workerBuildId:id},null,2)+'\n');
console.log(WORKER_LABEL+' build '+id);

// Keep the download page label, cache key and version check aligned with this build.
const page=fs.readFileSync('worker-code.html','utf8')
 .replace(/<title>Worker .*? —/,`<title>${WORKER_LABEL} —`).replace(/<h1>Worker .*?<\/h1>/,`<h1>${WORKER_LABEL}</h1>`)
 .replace(/worker\.txt\?v=[^"']+/g,'worker.txt?v=20261007-33.2-test').replace(/download="[^"]+"/,`download="${WORKER_LABEL.replace(' ','-')}.txt"`)
 .replace(/Pobierz Worker-[^<]+\.txt/,`Pobierz ${WORKER_LABEL.replace(' ','-')}.txt`)
 .replace(/text\.includes\('[^']+'\)/,`text.includes('${VERSION}')`);
fs.writeFileSync('worker-code.html',page);
