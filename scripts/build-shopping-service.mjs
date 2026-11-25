import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

export async function buildShoppingService(outfile){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const canonical=fs.readFileSync(path.join(root,'worker.js'),'utf8');
  function area(from,to){
    const begin=canonical.indexOf(from),end=canonical.indexOf(to,begin);
    if(begin<0||end<begin)throw Error('Shopping service source boundary has changed: '+from);
    return canonical.slice(begin,end);
  }
  const core=[area('class PlannerApiError extends Error','function quotaPeriod('),
    area('async function boundedRequestBody(','function validatePhotoTextImage('),
    area('const SHOP_OWNER_NAME =','export default {')].join('\n');
  const guest=fs.readFileSync(path.join(root,'wspolne-zakupy.html'),'utf8');
  const original="const api='https://moj-planer-api.yd7ynvj864.workers.dev/shopping/';";
  if(!guest.includes(original))throw Error('Guest shopping API configuration has changed.');
  const guestPage=guest.replace(original,"const api='/shopping/';").replaceAll('autocomplete="nickname"','autocomplete="off"');
  const assets={};
  const types={webp:'image/webp',ttf:'font/ttf',m4a:'audio/mp4'};
  for(const match of guestPage.matchAll(/(?:fonts\/|shopping-)[\w.-]+\.(webp|ttf|m4a)\b/g)){
    const name=match[0];assets['/'+name]={type:types[match[1]],data:fs.readFileSync(path.join(root,name)).toString('base64')};
  }
  await build({entryPoints:[path.join(root,'shopping-service/api.js')],outfile,bundle:true,format:'esm',platform:'browser',minifySyntax:true,plugins:[{
    name:'shopping-only',setup(b){
      b.onResolve({filter:/^(planner-shopping-core|shopping-guest-assets)$/},args=>({path:args.path,namespace:'shopping'}));
      b.onLoad({filter:/.*/,namespace:'shopping'},args=>({contents:args.path==='planner-shopping-core'
        ? core+'\nexport {shoppingUuid,shoppingOwnerKey,SHOP_OWNER_NAME,boundedRequestBody,parseApiJson,applySharedShoppingAction};'
        : 'export const guestPage='+JSON.stringify(guestPage)+'; export const assets='+JSON.stringify(assets)+';'}));
    }
  }]});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Podaj ścieżkę docelowego modułu Workera.');
  await buildShoppingService(process.argv[2]);
}
