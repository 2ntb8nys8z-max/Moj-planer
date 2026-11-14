import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {deploymentMetadata} from './deploy-worker.mjs';
const apiName='moj-planer-api',subdomain='yd7ynvj864',live=`https://${apiName}.${subdomain}.workers.dev`,alias='brief-27',preview=`https://${alias}-${apiName}.${subdomain}.workers.dev`;
// Upload a version only. This module has no production deployment/update call.
export async function publishBriefWorker({env=process.env,code,release,enablePreviewUrls=false,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!env.CLOUDFLARE_API_TOKEN||!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''))throw Error('Brak dostępu do testowego wdrożenia Cloudflare. Produkcja pozostaje bez zmian.');
 if(!code?.includes('day-brief-narrative-v1')||!code.includes(release.workerBuildId)||!code.includes(release.workerVersion)||createHash('sha256').update(code.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";')).digest('hex').slice(0,16)!==release.workerBuildId)throw Error('Pliki testowe nie odpowiadają wydaniu.');
 const base=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`,script='/workers/scripts/'+apiName;
 async function api(path,method='GET',body){const r=await fetchImpl(base+path,{method,body,headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(30000)});let data;try{data=await r.json()}catch(_){throw Error('Nieczytelna odpowiedź Cloudflare.')}if(!r.ok||data.success!==true)throw Error('Cloudflare odrzucił testowy upload (HTTP '+r.status+').');return data.result}
 async function info(url){const r=await fetchImpl(url+'/api-info',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Testowe API nie jest dostępne (HTTP '+r.status+').');const data=await r.json();if(data.success!==true||data.protocolVersion!==2)throw Error('Nieprawidłowa odpowiedź API.');return data}
 const domain=await api('/workers/subdomain');if(domain.subdomain!==subdomain)throw Error('Inne konto Cloudflare.');
 const routing=await api(script+'/subdomain'),disabled=routing.previews_enabled===false||routing.enabled===false&&routing.previews_enabled!==true;
 if(disabled&&!enablePreviewUrls)throw Error('Adresy testowych wersji są wyłączone. Nie zmieniono ustawień.');
 const settings=await api(script+'/settings'),safe=deploymentMetadata(settings),before=await info(live),deployments=await api(script+'/deployments');
 if(disabled){
  if(before.requiresAccess!==true||typeof routing.enabled!=='boolean')throw Error('Nie potwierdzono ochrony istniejącego API. Nie zmieniono ustawień.');
  const updated=await api(script+'/subdomain','POST',JSON.stringify({enabled:routing.enabled,previews_enabled:true}));
  if(updated.enabled!==routing.enabled||updated.previews_enabled!==true)throw Error('Nie potwierdzono włączenia testowych adresów.');
 }
 const metadata={main_module:'worker.js',bindings:safe.bindings,keep_bindings:safe.keep_bindings,compatibility_date:safe.compatibility_date,compatibility_flags:safe.compatibility_flags||[],annotations:{'workers/alias':alias,'workers/message':'Okti day brief PR 27 test only'}};
 const body=new FormData();body.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));body.append('worker.js',new Blob([code],{type:'application/javascript+module'}),'worker.js');
 const version=await api(script+'/versions?bindings_inherit=strict','POST',body);
 const after=await info(live),afterDeployments=await api(script+'/deployments');
 if(after.buildId!==before.buildId||after.apiVersion!==before.apiVersion||JSON.stringify(afterDeployments)!==JSON.stringify(deployments))throw Error('Zmienił się stan produkcji w czasie testowego uploadu. Wstrzymano publikację podglądu.');
 for(let i=0;i<8;i++){
  try{const test=await info(preview);if(test.requiresAccess===true&&test.buildId===release.workerBuildId&&test.apiVersion===release.workerVersion&&test.conversationFeatures?.includes('day-brief-narrative-v1'))return {url:preview,versionId:version.id,workerBuildId:test.buildId,productionUnchanged:true}}catch(_){}
  if(i<7)await sleep(3000);
 }
 throw Error('Wersja została przesłana, ale testowy adres nie potwierdził wydania. Produkcja nie została wdrożona.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const result=await publishBriefWorker({code:await readFile('worker.js','utf8'),release:JSON.parse(await readFile('release.json','utf8')),enablePreviewUrls:process.env.OKTI_ENABLE_PREVIEW_URLS==='true'});await mkdir('test-artifacts',{recursive:true});await writeFile('test-artifacts/brief-worker.json',JSON.stringify(result,null,2)+'\n');console.log('Testowy Worker: '+result.url+'; produkcja bez zmian.')}catch(error){console.error(error.message);process.exitCode=1}}
