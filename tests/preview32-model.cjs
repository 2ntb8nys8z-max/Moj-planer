const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const source = fs.readFileSync('preview32/worker.txt', 'utf8');
const context = vm.createContext({console, Response, Request, URL, URLSearchParams,
  TextEncoder, TextDecoder, Blob, FormData, crypto, Intl, Date,
  AbortController, setTimeout, clearTimeout});
vm.runInContext(source.replace('export default {', 'globalThis.worker = {'), context);
const calls = [];
const responses = [];
context.captureOpenAi = async (url, options) => {
  calls.push({url, body: JSON.parse(options.body)});
  assert.ok(responses.length, 'Unexpected model request');
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(responses.shift())}}]}));
};
vm.runInContext('fetchOpenAi = captureOpenAi', context);
context.turn = {
  text:'Nazwa jest poprawna, zmień ją.',
  history:[{role:'assistant',content:'Proponuję nazwę Nowa.'}],
  original:{type:'event',title:'Stara',date:'2026-10-07',startTime:'13:00',endTime:'14:00'},
  state:{draft:{type:'event',title:'Nowa',date:'2026-10-07',startTime:'13:00',endTime:'14:00'}},
  env:{OPENAI_API_KEY:'mock'},today:'2026-10-06'
};
const answer = action => ({reply:'Sprawdź propozycję.',kind:'event',action,
  operations:[],focus:'',ambiguity:null,intent:action==='review'?'execute':'continue',proposalId:null});

(async () => {
  const before = JSON.stringify(context.turn);
  responses.push(answer('review'));
  let result = await vm.runInContext('runConversationTurn(turn)', context);
  assert.equal(result.status,'review');
  assert.equal(result.item.title,'Nowa');
  assert.deepEqual(Array.from(result.item.changedFields),['title']);
  assert.equal(JSON.stringify(context.turn),before,'Input snapshot was mutated');
  assert.equal(calls[0].body.model,'gpt-6-luna');
  assert.equal(calls[0].body.reasoning_effort,'none');
  assert.equal(calls[0].body.temperature,0);
  assert.equal(calls[0].body.response_format.type,'json_object');

  responses.push(answer('continue'));
  result = await vm.runInContext('runConversationTurn(turn)', context);
  assert.equal(result.status,'continue','Model comparison must preserve routing');
  assert.equal(result.item,undefined,'Continue must not expose a write candidate');

  responses.push({...answer('review'),operations:[{op:'set',field:'date',value:'2026-02-30'}]},answer('review'));
  result = await vm.runInContext('runConversationTurn(turn)', context);
  assert.equal(result.status,'review');
  assert.equal(result.item.date,'2026-10-07','Rejected attempt leaked into draft');
  assert.equal(JSON.stringify(context.turn),before);

  responses.push({action:'raw',location:'Wólka Kosowska'});
  result = await vm.runInContext("interpretWeatherReply('Użyj poprawionej nazwy Wólka Kosowska',[],{location:'Wulka Kosowska',candidates:[]},turn.env)",context);
  assert.equal(result.location,'Wólka Kosowska');
  assert.equal(calls.at(-1).body.model,'gpt-4o-mini','Resolver model must remain unchanged');
  assert.match(source,/gpt-4o-mini-transcribe/);
  // Direct deletion reaches review even when the model requests continue.
  context.turn.original.location='Wólka Kosowska';
  context.turn.state={};context.turn.text='Usuń lokalizację.';
  responses.push({...answer('continue'),intent:'execute',operations:[{op:'clear',field:'location'}]});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'review');assert.equal(result.item.location,'');
  assert.equal(result.dialogueState.lastOperation.status,'preview_ready');
  assert.match(result.reply,/Sprawdź/);

  // A proposal does not advance until acceptance of that exact proposal.
  responses.push({...answer('continue'),intent:'propose',operations:[{op:'clear',field:'location'}]});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'continue');assert.ok(result.dialogueState.pendingProposal.id);
  const proposed=result.dialogueState;
  context.turn.state=proposed;context.turn.text='Tak, zrób to.';
  responses.push({...answer('continue'),intent:'accept',proposalId:proposed.pendingProposal.id});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'review');assert.equal(result.item.location,'');
  assert.equal(result.dialogueState.pendingProposal,null);

  // Reject restores the state before the proposal; stale acceptance fails closed.
  responses.push({...answer('continue'),intent:'reject',proposalId:proposed.pendingProposal.id});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'continue');assert.equal(result.dialogueState.draft.location,'Wólka Kosowska');
  assert.equal(result.dialogueState.pendingProposal,null);
  responses.push({...answer('continue'),intent:'accept',proposalId:'stale'},
    {...answer('continue'),intent:'accept',proposalId:'stale'});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'continue');assert.equal(result.item,undefined);
  assert.equal(result.dialogueState.lastOperation.status,'failed');

  // A question cannot review or mutate even if the model attaches legacy review.
  context.turn.state={};context.turn.text='Czy mogę usunąć lokalizację?';
  responses.push({...answer('review'),intent:'continue'});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'continue');assert.equal(result.dialogueState.draft.location,'Wólka Kosowska');
  context.turn.original=null;context.turn.state={};context.turn.text='Dodaj spotkanie.';
  responses.push({...answer('continue'),intent:'execute',operations:[{op:'set',field:'title',value:'Spotkanie'}]});
  result=await vm.runInContext('runConversationTurn(turn)',context);
  assert.equal(result.status,'continue');assert.equal(result.item,undefined);

  const normalized = source.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";');
  assert.equal(source.match(/const BUILD_ID="([^"]*)";/)[1],createHash('sha256').update(normalized).digest('hex').slice(0,16));
  assert.match(source,/apiVersion:"2026\.10\.06\.32\.3"/);
  console.log('Preview32.3 model contract: request parameters, review isolation, retry rollback, unchanged resolver and transcription, build identity passed. No live API calls.');
})().catch(error => {console.error(error);process.exitCode=1;});
