import fs from 'node:fs';import {createHash} from 'node:crypto';
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
fs.writeFileSync('release.json',JSON.stringify({version:'2026.10.06.30',protocolVersion:2,workerBuildId:id},null,2)+'\n');
console.log('Worker 30 build '+id);

// Keep the download page label, cache key and version check aligned with this build.
const page=fs.readFileSync('worker-code.html','utf8').replace(/Worker[- ]\d+/g,m=>m.startsWith('Worker-')?'Worker-30':'Worker 30').replace(/20261006-\d+/g,'20261006-30').replace(/2026\.10\.06\.\d+/g,'2026.10.06.30');
fs.writeFileSync('worker-code.html',page);
