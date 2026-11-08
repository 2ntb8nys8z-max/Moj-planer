import fs from 'node:fs';
import {createHash} from 'node:crypto';
const url='https://2ntb8nys8z-max.github.io/Moj-planer/';
const digest=value=>createHash('sha256').update(value).digest('hex');
const expected=digest(fs.readFileSync('index.html'));
for(let attempt=1;attempt<=30;attempt++){
 try{
  const response=await fetch(url+'?release=33.252&check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
  const actual=digest(Buffer.from(await response.arrayBuffer()));
  if(response.ok&&actual===expected){console.log('Verified deployed HTML matches the tested source: '+expected);process.exit(0);}
  console.log('Waiting for GitHub Pages to serve the tested HTML ('+attempt+'/30, HTTP '+response.status+').');
 }catch(error){console.log('Deployment check '+attempt+'/30: '+error.message)}
 if(attempt<30)await new Promise(resolve=>setTimeout(resolve,10000));
}
throw Error('GitHub Pages did not serve the exact tested source. Do not report deployment as verified.');
