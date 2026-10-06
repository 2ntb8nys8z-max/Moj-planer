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
  operations:[],focus:'',ambiguity:null});

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
  const normalized = source.replace(/const BUILD_ID="[^"]*";/,'const BUILD_ID="development";');
  assert.equal(source.match(/const BUILD_ID="([^"]*)";/)[1],createHash('sha256').update(normalized).digest('hex').slice(0,16));
  assert.match(source,/apiVersion:"2026\.10\.06\.32\.2"/);
  console.log('Preview32.2 model contract: request parameters, review isolation, retry rollback, unchanged resolver and transcription, build identity passed. No live API calls.');
})().catch(error => {console.error(error);process.exitCode=1;});
