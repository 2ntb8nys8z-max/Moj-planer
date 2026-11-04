const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const release=JSON.parse(fs.readFileSync('release.json','utf8'));

(async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const dom=new JSDOM(html,{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ctx=dom.getInternalVMContext();
  let sentPayload;
  Object.assign(w,{
    structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,
    confirm:()=>true,alert(){},
    fetch:async(url,options={})=>{
      if(String(url).endsWith('/api-info'))return new Response(JSON.stringify({success:true,requiresAccess:false,protocolVersion:2,conversationEngines:[2,3],apiVersion:release.workerVersion,buildId:release.workerBuildId}),{status:200});
      if(String(url).endsWith('.workers.dev')){
        sentPayload=JSON.parse(options.body);
        return new Response(JSON.stringify({
          success:true,engine:3,status:'review',utterance:sentPayload.text,
          item:{type:'event',title:'Test',date:'2026-10-08',startTime:'12:00',endTime:'13:00',location:'Wólka Kosowska pod Warszawą',changedFields:['location']},
          dialogueState:{draft:{location:'Wólka Kosowska pod Warszawą'}}
        }),{status:200});
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
  w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const script of w.document.querySelectorAll('script'))if(!script.src)vm.runInContext(script.textContent,ctx);

  vm.runInContext(`
    testLocationSession=beginVoiceDialogue('main',null,{type:'event',title:'Test',date:'2026-10-08',startTime:'12:00',endTime:'13:00',location:'Winkelkosowska'});
    testLocationSession.weatherContext={location:'Winkelkosowska',candidates:[{id:'1',label:'Winkelkosowska'}]};
    testLocationSession.pendingLocationResult={item:{location:'Winkelkosowska'}};
    testLocationSession.onWeatherAction=async()=>true;
  `,ctx);
  const result=await vm.runInContext("requestVoiceDialogue(testLocationSession,'Nie, chodzi mi o Wólkę Kosowską pod Warszawą.')",ctx);

  assert.equal(sentPayload.conversationEngine,3);
  assert.equal(sentPayload.text,'Nie, chodzi mi o Wólkę Kosowską pod Warszawą.');
  assert.equal(Object.hasOwn(sentPayload,'weatherContext'),false,'legacy weather resolver must not intercept an Engine 3 correction');
  assert.equal(result.item.location,'Wólka Kosowska pod Warszawą');
  assert.equal(await vm.runInContext("prepareVoiceLocation({}, {item:{type:'event',location:'Wólka Kosowska'}})",ctx),false);
  assert.equal(vm.runInContext("'weatherContext' in testLocationSession || 'pendingLocationResult' in testLocationSession || 'onWeatherAction' in testLocationSession",ctx),false);

  console.log('Conversation 33 location: corrections stay in Engine 3 and bypass the legacy weather dialogue.');
  dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1});
