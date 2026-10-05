import fs from 'node:fs';import assert from 'node:assert/strict';
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'));
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(sql){return {run:async()=>{},bind(){return this},first:async()=>sql.includes('RETURNING attempts')?{attempts:11}:{}}}}};
const headers={'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN};
const original={type:'event',title:'Audio test',date:'2026-10-06',startTime:'13:00',endTime:'14:00',notes:'',location:''};
const old=globalThis.fetch;let count=0;
try{
 globalThis.fetch=async(url,options)=>{assert.ok(url.endsWith('/audio/transcriptions'));assert.equal(options.body.get('language'),'pl');assert.equal(options.body.get('file').type,'audio/mp4');count++;return new Response(JSON.stringify({text:'Zrób z tego wydarzenie całodniowe.'}))};
 let response=await worker.fetch(new Request('https://worker/',{method:'POST',headers,body:JSON.stringify({protocolVersion:2,text:'',currentItem:original,audio:{type:'audio/mp4; codecs=mp4a.40.2',base64:'AAAA'}})}),env);
 let result=await response.json();assert.equal(response.status,200);assert.equal(result.item.startTime,'');assert.equal(count,1);
 response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{...headers,Authorization:'Bearer incorrect'},body:'{}'}),env);assert.equal(response.status,429);assert.equal(count,1);
 response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:'{}'}),env);assert.equal(response.status,403);
 response=await worker.fetch(new Request('https://worker/',{method:'POST',headers,body:JSON.stringify({text:'test',currentItem:{...original,notes:'a'.repeat(13000)}})}),env);assert.equal(response.status,413);
 response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{Authorization:headers.Authorization,'Content-Type':'audio/mp4','X-Voice-Dialogue':'%invalid'},body:'x'}),env);assert.equal(response.status,400);
 response=await worker.fetch(new Request('https://worker/api-info'),env);result=await response.json();assert.equal(result.protocolVersion,2);assert.match(result.buildId,/^[a-f0-9]{16}$/);
 console.log('API: audio JSON contract, Polish STT hint, auth throttle, origin, context limit, malformed header and release identity passed.');
}finally{globalThis.fetch=old}
