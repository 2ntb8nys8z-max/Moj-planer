const fs=require('node:fs');
const assert=require('node:assert/strict');

const root=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const rootWorkerText=fs.readFileSync('worker.txt','utf8');
const previewWorkerText=fs.readFileSync('preview33/worker.txt','utf8');
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));

assert.match(root,/Aplikacja: 2026\.10\.09\.33\.17-integration/);
assert.match(preview,/Aplikacja: 2026\.10\.09\.33\.17-test/);
assert.match(preview,/generowany automatycznie z kanonicznego frontendu/);
assert.match(preview,/const PREVIEW33_PREFIX='planner-preview-33:'/);
assert.match(preview,/e\.key===PREVIEW33_STORE\.key\(KEY\)/,'storage events must use the preview-prefixed key');
assert.doesNotMatch(preview,/e\.key===KEY/);
for(const file of ['sync-core.js','google-calendar.js']){
  const content=fs.readFileSync(file,'utf8');
  const buildId=require('node:crypto').createHash('sha256').update(content).digest('hex').slice(0,16);
  assert.ok(preview.includes('src="'+file+'?v='+buildId+'"'));
  assert.equal(fs.readFileSync('preview33/'+file,'utf8'),content,'Preview must publish the exact tested module');
}
assert.match(preview,/delete session\.weatherContext;delete session\.onWeatherAction;delete session\.pendingLocationResult/);
assert.doesNotMatch(preview,/apiInfoCache=\{requiresAccess:true\}/);
assert.match(root,/function applyVoiceUiAction\(session,action,reply=''/);
assert.match(root,/open_create_event/);
assert.match(root,/open_event/);
assert.match(root,/find_entry/);
assert.match(root,/id="tabEntries"/);
assert.doesNotMatch(root,/id="entryTypeFilters"/,'entry subtypes stay in one combined list');
assert.match(root,/id="recordMemo"/);
assert.doesNotMatch(root,/plannerIdeaType/);
assert.match(root,/function plannerSearchScore/);
assert.match(root,/function startEventCreationConversation/);
assert.match(root,/\['list_entries','find_entry','open_event','find_free_time'\]/);
assert.match(root,/shopping-list/);
assert.match(root,/historyModal/);
assert.equal(rootWorkerText,worker,'root worker.txt must exactly match canonical worker.js');
assert.equal(previewWorkerText,worker,'published test Worker must exactly match canonical worker.js');
assert.match(worker,/^\/\/ MÓJ PLANER — WORKER 33\.17-TEST — CONVERSATION 33/);
assert.match(worker,/apiVersion:"2026\.10\.09\.33\.17-test"/);
assert.match(worker,new RegExp(`const BUILD_ID="${release.workerBuildId}"`));
assert.equal(release.version,'2026.10.09.33.17-test');
assert.equal(release.source,'integration/conversation33/index.html');

console.log('Preview 33.17: entry view and 33.17 Worker are aligned.');
