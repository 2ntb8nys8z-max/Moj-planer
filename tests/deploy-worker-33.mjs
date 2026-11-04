import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deployWorker,deploymentMetadata} from '../scripts/deploy-worker.mjs';

const version='2026.10.12.33.36-test';
const unbuilt=`const BUILD_ID="development";\nexport default {fetch(){return Response.json({apiVersion:"${version}"});}};\n`;
const buildId=createHash('sha256').update(unbuilt).digest('hex').slice(0,16);
const workerCode=unbuilt.replace('"development"',`"${buildId}"`);
const release={workerVersion:version,workerBuildId:buildId,protocolVersion:2};
const env={CLOUDFLARE_API_TOKEN:'test-token-that-must-never-appear-in-output',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)};
const settings={
  bindings:[
    {name:'OPENAI_API_KEY',type:'secret_text'},
    {name:'PLANNER_ACCESS_TOKEN',type:'secret_text'},
    {name:'OTHER_KEY',type:'secret_key'},
    {name:'API_LIMITS_DB',type:'d1',id:'existing-quota-database'},
    {name:'OTHER_RESOURCE',type:'kv_namespace',namespace_id:'existing-namespace'},
    {name:'CONFIG',type:'plain_text',text:'existing-value'},
  ],
  compatibility_date:'2026-09-01',compatibility_flags:['nodejs_compat'],
  usage_model:'standard',logpush:false,tail_consumers:[],tags:['planner'],
  limits:{cpu_ms:50},observability:{enabled:true,logs:{enabled:true,invocation_logs:true}},
  placement:{mode:'smart',status:'SUCCESS',last_analyzed_at:'2026-10-11T00:00:00Z'},
  annotations:{'workers/message':'previous deployment','workers/triggered_by':'upload'},
};
const oldInfo={success:true,apiVersion:'2026.10.10.33.35-test',buildId:'92b8fa5563c6a549',protocolVersion:2};
const newInfo={...oldInfo,apiVersion:version,buildId};
const response=result=>Response.json({success:true,result});
function mock({domain='yd7ynvj864',initial=oldInfo,final=newInfo,after=settings,cloudflareError=false}={}){
  const calls=[],uploads=[],logs=[],sleeps=[];
  let uploadDone=false;
  const fetchImpl=async(url,options={})=>{
    calls.push({url,method:options.method||'GET'});
    if(url.startsWith('https://moj-planer-api.yd7ynvj864.workers.dev/api-info?')){
      assert.equal(options.headers,undefined,'Cloudflare API token is never sent to the public Worker');
      assert.equal(options.cache,'no-store');
      return Response.json(uploadDone?final:initial);
    }
    assert.equal(new URL(url).hostname,'api.cloudflare.com');
    assert.equal(options.headers.Authorization,`Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    assert.equal(options.redirect,'error','Do not forward credentials through a redirect');
    if(cloudflareError)return Response.json({success:false,errors:[{code:10000,message:env.CLOUDFLARE_API_TOKEN}]},{status:403});
    if(url.endsWith('/workers/subdomain'))return response({subdomain:domain});
    if(url.endsWith('/workers/scripts/moj-planer-api/settings'))return response(uploadDone?after:settings);
    if(url.endsWith('/workers/scripts/moj-planer-api?bindings_inherit=strict')){
      assert.equal(options.method,'PUT');
      const metadata=JSON.parse(await options.body.get('metadata').text());
      const uploadedSource=await options.body.get('worker.js').text();
      uploads.push({metadata,uploadedSource});uploadDone=true;
      return response({deployment_id:'existing-worker-new-version'});
    }
    assert.fail(`Unexpected HTTP path ${new URL(url).pathname}`);
  };
  return {calls,uploads,logs,sleeps,options:{env,workerCode,release,fetchImpl,log:message=>logs.push(message),sleep:async ms=>sleeps.push(ms)}};
}

const metadata=deploymentMetadata(settings);
assert.deepEqual(metadata.keep_bindings,['secret_text','secret_key']);
assert.deepEqual(metadata.bindings,[
  {name:'API_LIMITS_DB',type:'inherit'},
  {name:'OTHER_RESOURCE',type:'inherit'},
  {name:'CONFIG',type:'inherit'},
]);
assert.equal(metadata.compatibility_date,settings.compatibility_date);
assert.deepEqual(metadata.compatibility_flags,settings.compatibility_flags);
assert.deepEqual(metadata.observability,settings.observability);
assert.deepEqual(metadata.placement,{mode:'smart'});
assert.ok(!JSON.stringify(metadata).includes('existing-value'),'No variable value is resubmitted');
assert.ok(!('annotations' in metadata),'Read-only old deployment annotations are not replayed');
assert.deepEqual(deploymentMetadata({...settings,compatibility_date:'2026-09-01T00:00:00Z'}).compatibility_date,'2026-09-01');

const success=mock();
const result=await deployWorker(success.options);
assert.equal(result.workerBuildId,buildId);
assert.equal(result.alreadyDeployed,false);
assert.equal(success.uploads.length,1);
assert.equal(success.uploads[0].uploadedSource,workerCode);
assert.deepEqual(success.uploads[0].metadata,metadata);
assert.equal(success.sleeps.length,0);
assert.ok(success.logs.some(line=>line.includes(buildId)&&line.includes(version)));
assert.ok(success.logs.every(line=>!line.includes(env.CLOUDFLARE_API_TOKEN)));

const already=mock({initial:newInfo});
assert.equal((await deployWorker(already.options)).alreadyDeployed,true);
assert.equal(already.uploads.length,0,'Do not redeploy an already verified build');

let unconfiguredFetch=0;
await assert.rejects(deployWorker({...success.options,env:{},fetchImpl:async()=>{unconfiguredFetch++;}}),/secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required/);
assert.equal(unconfiguredFetch,0,'Missing authentication must fail before any network request');

const wrongAccount=mock({domain:'another-account'});
await assert.rejects(deployWorker(wrongAccount.options),/does not own the expected/);
assert.equal(wrongAccount.uploads.length,0,'Never create or update a Worker in another account');
assert.equal(wrongAccount.calls.length,1);

const wrongEndpoint=mock({initial:{success:true,protocolVersion:1}});
await assert.rejects(deployWorker(wrongEndpoint.options),/not the expected Planner Worker/);
assert.equal(wrongEndpoint.uploads.length,0);

const unauthorized=mock({cloudflareError:true});
await assert.rejects(deployWorker(unauthorized.options),error=>error.message==='Cloudflare GET failed (HTTP 403, API codes 10000).'&&!error.message.includes(env.CLOUDFLARE_API_TOKEN));
assert.equal(unauthorized.uploads.length,0);

const badBuild=mock();
await assert.rejects(deployWorker({...badBuild.options,workerCode:workerCode+'// changed after build\n'}),/source and release.json differ/);
assert.equal(badBuild.calls.length,0);

assert.throws(()=>deploymentMetadata({...settings,bindings:settings.bindings.filter(binding=>binding.name!=='API_LIMITS_DB')}),/D1 binding is missing/);
assert.throws(()=>deploymentMetadata({...settings,bindings:settings.bindings.filter(binding=>binding.name!=='OPENAI_API_KEY')}),/OPENAI_API_KEY secret binding is missing/);
assert.throws(()=>deploymentMetadata({...settings,unknown_setting:{enabled:true}}),/cannot be safely preserved/);
assert.throws(()=>deploymentMetadata({...settings,exports:{OldObject:{type:'durable-object',state:'deleted'}}}),/cannot be safely preserved/);
assert.throws(()=>deploymentMetadata({...settings,migrations:{new_tag:'v2'}}),/cannot be safely preserved/);

const lostBinding=mock({after:{...settings,bindings:settings.bindings.filter(binding=>binding.name!=='OTHER_RESOURCE')}});
await assert.rejects(deployWorker(lostBinding.options),/binding inventory could not be verified/);
assert.equal(lostBinding.uploads.length,1,'An unverified upload must not be reported as deployment success');

const changedConfig=mock({after:{...settings,compatibility_flags:[]}});
await assert.rejects(deployWorker(changedConfig.options),/preservation of Worker setting compatibility_flags/);

const stale=mock({final:oldInfo});
await assert.rejects(deployWorker(stale.options),/did not confirm Worker/);
assert.equal(stale.sleeps.length,11);
assert.ok(stale.sleeps.every(ms=>ms===5000));
assert.equal(stale.logs.length,0,'An old public /api-info never counts as successful verification');

console.log('Worker deployment safety: existing account and Worker, preserved secrets/D1/settings, no unverified success — passed (mocked Cloudflare HTTP).');
