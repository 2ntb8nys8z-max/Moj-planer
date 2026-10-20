import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyPreview} from '../scripts/verify-preview33.mjs';
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));
const exact=async url=>new Response(fs.readFileSync('preview33/'+new URL(url).pathname.split('/').at(-1)));
assert.deepEqual(await verifyPreview('https://planner.test/preview33/',exact),release);
for(const stale of ['release.json','index.html','google-calendar.js','sync-core.js','shopping-paper-texture.webp']){
 await assert.rejects(()=>verifyPreview('https://planner.test/preview33/',url=>String(url).includes('/'+stale+'?')?new Response('stale published data'):exact(url)),/published bytes do not match/);
}
await assert.rejects(()=>verifyPreview('https://planner.test/preview33/',()=>new Response('missing',{status:404})),/HTTP 404/);
await assert.rejects(()=>verifyPreview('https://planner.test/preview33/',()=>{throw Error('network unavailable')}),/network unavailable/);
console.log('Preview publication: exact bytes including paper texture accepted; stale assets, HTTP and network failures reject success.');
