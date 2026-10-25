import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPreview(base,request=fetch){
 const expectedRelease=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));
 for(const file of ['release.json','index.html','google-calendar.js','sync-core.js','octi-water-motion.mp4','octi-water-motion.webp','octi-water-motion-poster.webp','shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp','shopping-update-button.webp','shopping-close-x-v2.webp','shopping-purchased-note-v3.webp']){
  const expected=fs.readFileSync('preview33/'+file),url=new URL(file,base);url.searchParams.set('verify',expectedRelease.frontendBuildId);
  const response=await request(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
  const served=Buffer.from(await response.arrayBuffer());
  if(hash(served)!==hash(expected))throw Error(`${file}: published bytes do not match the tested build ${expectedRelease.version}`);
 }
 return expectedRelease;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const base=process.argv[2];if(!base)throw Error('Usage: node scripts/verify-preview33.mjs <Preview33 URL ending in />');
 let verified=false;
 for(let attempt=1;attempt<=30;attempt++){
  try{const release=await verifyPreview(base);console.log(`Verified live ${release.version}; frontend ${release.frontendBuildId}; exact HTML, release, sync modules, approved logo media and physical shopping artwork.`);verified=true;break}
  catch(error){console.log(`Preview verification ${attempt}/30: ${error.message}`);if(attempt<30)await delay(20000)}
 }
 if(!verified)process.exitCode=1;
}
