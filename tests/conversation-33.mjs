import fs from 'node:fs';import assert from 'node:assert/strict';
const load=async path=>(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64'))).default;
const worker=await load('worker.js');
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model={},modelCalls=0;const old=globalThis.fetch;
globalThis.fetch=async(u,o)=>{modelCalls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
async function post(text,state=null,currentItem=null){const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({protocolVersion:2,conversationEngine:3,text,currentItem,dialogueState:state,dialogue:[]})}),env);assert.equal(response.status,200);return response.json()}
try{
 model={reply:'Ustalam nazwę.',kind:'event',action:'continue',intent:'execute',proposalId:null,operations:[{op:'set',field:'title',value:'Dentysta'}],focus:'termin i godziny',ambiguity:null};
 let r=await post('Nazwij Dentysta');assert.equal(r.engine,3);assert.equal(r.status,'continue');assert.equal(r.dialogueState.draft.title,'Dentysta');assert.match(r.reply,/Zmiana jest w szkicu/);
 model={reply:'Ustalam termin i godziny.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:[{op:'set',field:'date',value:'2026-10-08'},{op:'set',field:'startTime',value:'15:00'},{op:'set',field:'endTime',value:'15:45'}],focus:'',ambiguity:null};
 r=await post('Jutro od 15 do 15:45',r.dialogueState);assert.equal(r.status,'review');assert.equal(r.item.title,'Dentysta');assert.equal(r.item.startTime,'15:00');
 model={reply:'Może Zielona Góra?',kind:'event',action:'continue',intent:'propose',proposalId:null,operations:[{op:'set',field:'location',value:'Zielona Góra'}],focus:'potwierdzenie lokalizacji',ambiguity:null};
 const original={type:'event',title:'Test',date:'2026-10-08',startTime:'15:00',endTime:'15:45',location:''};
 r=await post('Może Zielona Góra',null,original);assert.equal(r.status,'continue');assert.ok(r.dialogueState.pendingProposal?.id);assert.equal(r.dialogueState.draft.location,'Zielona Góra');
 const pid=r.dialogueState.pendingProposal.id;
 model={reply:'Tak.',kind:'event',action:'continue',intent:'accept',proposalId:pid,operations:[],focus:'',ambiguity:null};
 r=await post('Tak',r.dialogueState,original);assert.equal(r.status,'review');assert.equal(r.item.location,'Zielona Góra');

 // Engine 3 must receive short turns before legacy Engine 2 shortcuts.
 for(const test of [
  {text:'Jutro',operations:[{op:'set',field:'date',value:'2026-10-08'}]},
  {text:'Od 15:00 do 16:00',operations:[{op:'set',field:'startTime',value:'15:00'},{op:'set',field:'endTime',value:'16:00'}]},
  {text:'Zrób z tego wydarzenie całodniowe.',operations:[{op:'clear',field:'startTime'},{op:'clear',field:'endTime'}]}
 ]){
  model={reply:'Wprowadzam zmianę.',kind:'event',action:'continue',intent:'modify',proposalId:null,operations:test.operations,focus:'',ambiguity:null};
  const before=modelCalls,short=await post(test.text,null,original);assert.equal(short.engine,3);assert.equal(modelCalls,before+1);
 }
 console.log('Conversation 33: Engine 3 opt-in, persistent draft, review readiness and proposal acceptance passed (mocked AI).');
}finally{globalThis.fetch=old}
