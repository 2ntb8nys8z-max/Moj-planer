import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publishBriefWorker} from '../scripts/publish-brief-worker.mjs';
const env={CLOUDFLARE_API_TOKEN:'fixture-not-printed',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)},code=fs.readFileSync('worker.js','utf8'),release=JSON.parse(fs.readFileSync('release.json','utf8'));
const settings={compatibility_date:'2026-09-01',bindings:[{name:'OPENAI_API_KEY',type:'secret_text'},{name:'PLANNER_ACCESS_TOKEN',type:'secret_text'},{name:'API_LIMITS_DB',type:'d1',id:'existing-db'}]},old={success:true,requiresAccess:true,protocolVersion:2,apiVersion:'old',buildId:'old'},next={...old,apiVersion:release.workerVersion,buildId:release.workerBuildId,conversationFeatures:['day-brief-narrative-v1']};
function mock({disabled=false,changed=false}={}){
 const writes=[];let uploaded=false;
 return {writes,fetchImpl:async(url,options={})=>{
  if(url==='https://moj-planer-api.yd7ynvj864.workers.dev/api-info'){assert.equal(options.headers,undefined);return Response.json(changed&&uploaded?next:old)}
  if(url==='https://brief-27-moj-planer-api.yd7ynvj864.workers.dev/api-info'){assert.equal(options.headers,undefined);return Response.json(next)}
  assert.equal(new URL(url).hostname,'api.cloudflare.com');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+env.CLOUDFLARE_API_TOKEN);
  const path=new URL(url).pathname;let result;
  if(options.method!=='GET'){
   writes.push({path,method:options.method});assert.equal(options.method,'POST');
   if(path.endsWith('/subdomain')){assert.equal(options.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(options.body),{enabled:true,previews_enabled:true});return Response.json({success:true,result:{enabled:true,previews_enabled:true}})}
   assert.ok(path.endsWith('/versions'));assert.equal(new URL(url).searchParams.get('bindings_inherit'),'strict');
   const metadata=JSON.parse(await options.body.get('metadata').text());assert.equal(metadata.annotations['workers/alias'],'brief-27');assert.deepEqual(metadata.keep_bindings,['secret_text','secret_key']);assert.deepEqual(metadata.bindings,[{name:'API_LIMITS_DB',type:'inherit'}]);assert.equal(await options.body.get('worker.js').text(),code);assert.ok(!JSON.stringify(metadata).includes(env.CLOUDFLARE_API_TOKEN));uploaded=true;result={id:'fixture-version'};
  }else if(path.endsWith('/workers/subdomain'))result={subdomain:'yd7ynvj864'};
  else if(path.endsWith('/subdomain'))result={enabled:true,previews_enabled:!disabled};
  else if(path.endsWith('/settings'))result=settings;
  else if(path.endsWith('/deployments'))result={deployments:[{id:'existing-deployment',versions:[{version_id:'old',percentage:100}]}]};
  else assert.fail('Unexpected Cloudflare endpoint: '+path);
  return Response.json({success:true,result});
 }};
}
const good=mock(),result=await publishBriefWorker({env,code,release,fetchImpl:good.fetchImpl});assert.equal(result.productionUnchanged,true);assert.equal(good.writes.length,1);
const disabled=mock({disabled:true});await assert.rejects(()=>publishBriefWorker({env,code,release,fetchImpl:disabled.fetchImpl}),/wyłączone/);assert.equal(disabled.writes.length,0);
const enable=mock({disabled:true});assert.equal((await publishBriefWorker({env,code,release,enablePreviewUrls:true,fetchImpl:enable.fetchImpl})).productionUnchanged,true);assert.equal(enable.writes.length,2);
const race=mock({changed:true});await assert.rejects(()=>publishBriefWorker({env,code,release,fetchImpl:race.fetchImpl}),/Zmienił się stan produkcji/);assert.equal(race.writes.length,1,'A concurrent production change must never trigger rollback or a second write');
await assert.rejects(()=>publishBriefWorker({env:{},code,release}),/Brak dostępu/);
await assert.rejects(()=>publishBriefWorker({env,code:code+'// untested',release,fetchImpl:good.fetchImpl}),/nie odpowiadają/);
console.log('Brief preview release: exact artifact identity, versions-only POST, inherited bindings, no secret leakage, unchanged production code and routing, disabled preview refusal and concurrent production change detection passed (Cloudflare fixtures).');
