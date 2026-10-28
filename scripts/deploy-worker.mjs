import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Deploy only the existing API used by Preview33. Do not provision accounts,
// Workers, bindings, secrets or routes as a side effect of a code release.
const WORKER_NAME='moj-planer-api';
const WORKERS_SUBDOMAIN='yd7ynvj864';
const WORKER_URL=`https://${WORKER_NAME}.${WORKERS_SUBDOMAIN}.workers.dev`;
const SECRET_TYPES=new Set(['secret_text','secret_key']);
const CONFIG_FIELDS=new Set(['cache_options','compatibility_date','compatibility_flags','limits','logpush','observability','placement','tags','tail_consumers','usage_model']);
const READ_ONLY_FIELDS=new Set(['annotations','exports_reconciliation','id','etag','created_on','modified_on','has_modules','last_deployed_from','pipeline_hash','tag','handlers','deployment_id','main_module','body_part']);

class DeploymentError extends Error{}
function fail(message){throw new DeploymentError(message);}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function stable(value){
  if(Array.isArray(value))return JSON.stringify(value.map(item=>JSON.parse(stable(item))));
  if(object(value))return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])));
  return JSON.stringify(value);
}

export function deploymentMetadata(settings){
  if(!object(settings)||!Array.isArray(settings.bindings))fail('Existing Worker settings have no binding inventory; no upload performed.');
  for(const key of Object.keys(settings)){
    if(CONFIG_FIELDS.has(key)||READ_ONLY_FIELDS.has(key)||key==='bindings')continue;
    // Migrations and export lifecycle changes are deliberately never replayed.
    // Stop if they exist instead of risking unrelated infrastructure changes.
    if((key==='migrations'||key==='exports')&&(settings[key]==null||Object.keys(settings[key]).length===0))continue;
    fail(`Existing Worker setting ${key} cannot be safely preserved; no upload performed.`);
  }
  if(typeof settings.compatibility_date!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(settings.compatibility_date))fail('Existing Worker compatibility date is unavailable; no upload performed.');
  const names=new Set();
  for(const binding of settings.bindings){
    if(!object(binding)||typeof binding.name!=='string'||!binding.name||typeof binding.type!=='string'||names.has(binding.name))fail('Existing Worker has an invalid binding inventory; no upload performed.');
    names.add(binding.name);
    if(binding.type==='durable_object_namespace')fail('Existing Worker has Durable Object bindings that require a separate migration review; no upload performed.');
  }
  const quota=settings.bindings.find(binding=>binding.name==='API_LIMITS_DB');
  if(quota?.type!=='d1'||typeof quota.id!=='string'||!quota.id)fail('Existing API_LIMITS_DB D1 binding is missing; no upload performed.');
  for(const name of ['OPENAI_API_KEY','PLANNER_ACCESS_TOKEN']){
    if(!settings.bindings.some(binding=>binding.name===name&&SECRET_TYPES.has(binding.type)))fail(`Existing ${name} secret binding is missing; no upload performed.`);
  }
  const metadata={main_module:'worker.js',keep_bindings:[...SECRET_TYPES]};
  // Inherit by name under bindings_inherit=strict. The API keeps each exact
  // existing resource/variable without us reading or resubmitting its value.
  metadata.bindings=settings.bindings.filter(binding=>!SECRET_TYPES.has(binding.type)).map(binding=>({name:binding.name,type:'inherit'}));
  for(const key of CONFIG_FIELDS){if(settings[key]!==undefined&&settings[key]!==null)metadata[key]=structuredClone(settings[key]);}
  metadata.compatibility_date=settings.compatibility_date.slice(0,10);
  if(metadata.placement){delete metadata.placement.status;delete metadata.placement.last_analyzed_at;}
  return metadata;
}

function checkArtifact(workerCode,release){
  if(typeof workerCode!=='string'||!object(release)||release.protocolVersion!==2||typeof release.workerVersion!=='string'||!/^\d{4}\.\d{2}\.\d{2}\.33\.\d+-test$/.test(release.workerVersion)||! /^[a-f0-9]{16}$/.test(release.workerBuildId||''))fail('Invalid generated Worker release; no upload performed.');
  const codeVersion=workerCode.match(/apiVersion:"([^"]+)"/)?.[1];
  const codeBuild=workerCode.match(/const BUILD_ID="([^"]+)";/)?.[1];
  const calculated=createHash('sha256').update(workerCode.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";')).digest('hex').slice(0,16);
  if(codeVersion!==release.workerVersion||codeBuild!==release.workerBuildId||calculated!==release.workerBuildId)fail('Worker source and release.json differ; regenerate artifacts before deployment.');
}

function bindingInventory(bindings){
  return bindings.map(binding=>SECRET_TYPES.has(binding.type)?{name:binding.name,type:binding.type}:binding).sort((a,b)=>a.name.localeCompare(b.name));
}

export async function deployWorker({env=process.env,workerCode,release,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=console.log}={}){
  const token=env.CLOUDFLARE_API_TOKEN,accountId=env.CLOUDFLARE_ACCOUNT_ID;
  if(typeof token!=='string'||!token.trim()||typeof accountId!=='string'||!accountId.trim())fail('Cloudflare deployment blocked: GitHub Actions secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required. No upload performed.');
  if(!/^[a-f0-9]{32}$/i.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID has an invalid format; no upload performed.');
  checkArtifact(workerCode,release);
  const apiBase=`https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const scriptPath=`/workers/scripts/${WORKER_NAME}`;
  async function cfRequest(path,{method='GET',body}={}){
    let response;
    try{response=await fetchImpl(apiBase+path,{method,body,headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(30000)});}catch(_){fail(`Cloudflare ${method} request failed before verification.`);}
    let data;try{data=await response.json();}catch(_){fail(`Cloudflare ${method} returned an unreadable response (HTTP ${response.status}).`);}
    if(!response.ok||data.success!==true){
      // Never print response bodies, binding values or credentials.
      const codes=Array.isArray(data.errors)?data.errors.map(error=>error.code).filter(Number.isInteger).join(','):'';
      fail(`Cloudflare ${method} failed (HTTP ${response.status}${codes?`, API codes ${codes}`:''}).`);
    }
    return data.result;
  }
  async function publicInfo(){
    let response;try{response=await fetchImpl(`${WORKER_URL}/api-info?release-check=${release.workerBuildId}&nonce=${Date.now()}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});}catch(_){fail('Public Worker /api-info could not be reached.');}
    let info;try{info=await response.json();}catch(_){fail('Public Worker /api-info returned an unreadable response.');}
    if(!response.ok||info.success!==true||info.protocolVersion!==release.protocolVersion||typeof info.apiVersion!=='string'||typeof info.buildId!=='string')fail('Public endpoint is not the expected Planner Worker API.');
    return info;
  }
  const domain=await cfRequest('/workers/subdomain');
  if(domain?.subdomain!==WORKERS_SUBDOMAIN)fail('Cloudflare account does not own the expected workers.dev subdomain; no upload performed.');
  const before=await cfRequest(scriptPath+'/settings');
  const metadata=deploymentMetadata(before);
  const oldInfo=await publicInfo();
  if(oldInfo.apiVersion===release.workerVersion&&oldInfo.buildId===release.workerBuildId){
    log(`Cloudflare already serves Worker ${release.workerVersion}; build ${release.workerBuildId}.`);
    return {alreadyDeployed:true,workerVersion:release.workerVersion,workerBuildId:release.workerBuildId};
  }
  const body=new FormData();
  body.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  body.append('worker.js',new Blob([workerCode],{type:'application/javascript+module'}),'worker.js');
  const upload=await cfRequest(scriptPath+'?bindings_inherit=strict',{method:'PUT',body});
  const after=await cfRequest(scriptPath+'/settings');
  if(!Array.isArray(after?.bindings)||stable(bindingInventory(after.bindings))!==stable(bindingInventory(before.bindings)))fail('Upload completed, but the existing binding inventory could not be verified.');
  const afterMetadata=deploymentMetadata(after);
  for(const key of CONFIG_FIELDS){
    if(stable(afterMetadata[key]??null)!==stable(metadata[key]??null))fail(`Upload completed, but preservation of Worker setting ${key} could not be verified.`);
  }
  for(let attempt=0;attempt<12;attempt++){
    let info;try{info=await publicInfo();}catch(_){/* Propagation may be temporarily unavailable. */}
    if(info?.apiVersion===release.workerVersion&&info?.buildId===release.workerBuildId){
      const versionId=typeof upload?.deployment_id==='string'&&/^[a-zA-Z0-9-]+$/.test(upload.deployment_id)?upload.deployment_id:null;
      log(`Verified Cloudflare Worker ${release.workerVersion}; build ${release.workerBuildId}${versionId?`; deployment ${versionId}`:''}.`);
      return {alreadyDeployed:false,workerVersion:release.workerVersion,workerBuildId:release.workerBuildId,deploymentId:versionId};
    }
    if(attempt<11)await sleep(5000);
  }
  fail(`Cloudflare upload completed, but /api-info did not confirm Worker ${release.workerVersion} build ${release.workerBuildId}.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    // Validate configured credentials before reading/building deployment data.
    if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)fail('Cloudflare deployment blocked: GitHub Actions secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required. No upload performed.');
    const [workerCode,releaseText]=await Promise.all([readFile('worker.js','utf8'),readFile('release.json','utf8')]);
    await deployWorker({workerCode,release:JSON.parse(releaseText)});
  }catch(error){
    console.error(error instanceof DeploymentError?error.message:'Worker deployment failed while reading or processing release artifacts.');
    process.exitCode=1;
  }
}
