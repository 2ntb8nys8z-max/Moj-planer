const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

(async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ctx=dom.getInternalVMContext();
  let apiInfoCalls=0,conversationCalls=0;
  const oldToken='o'.repeat(24),newToken='n'.repeat(24);

  Object.assign(w,{
    structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,
    confirm:()=>true,alert(){},
    fetch:async(url,options={})=>{
      if(String(url).endsWith('/api-info')){
        apiInfoCalls++;
        return new Response(JSON.stringify({success:true,requiresAccess:true,protocolVersion:2,conversationEngines:[2,3],apiVersion:release.workerVersion,buildId:release.workerBuildId}),{status:200});
      }
      if(String(url).endsWith('.workers.dev')){
        conversationCalls++;
        if(options.headers?.Authorization===`Bearer ${oldToken}`){
          return new Response(JSON.stringify({success:false,code:'access_denied',error:'Nieprawidłowy kod.'}),{status:401});
        }
        assert.equal(options.headers?.Authorization,`Bearer ${newToken}`);
        return new Response(JSON.stringify({success:true,engine:3,status:'continue',reply:'OK',dialogueState:{}}),{status:200});
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);

  vm.runInContext(`saveApiAccess('${oldToken}');askApiAccess=async()=>{saveApiAccess('${newToken}');return '${newToken}'}`,ctx);
  const request="plannerApiRequest('',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})";

  const first=await vm.runInContext(request,ctx);
  assert.equal(first.engine,3);
  const second=await vm.runInContext(request,ctx);
  assert.equal(second.engine,3);
  assert.equal(apiInfoCalls,1,'verified Worker capabilities should survive the access retry');
  assert.equal(conversationCalls,3,'one rejected call, its retry, and the next conversation call are expected');
  assert.deepEqual(Array.from(vm.runInContext('apiInfoCache.conversationEngines',ctx)),[2,3]);

  console.log('Conversation 33 access: a 401 retry preserves verified Engine 3 capabilities.');
  dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1});
