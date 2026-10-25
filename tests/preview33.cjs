const fs=require('node:fs');
const assert=require('node:assert/strict');

const root=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const rootWorkerText=fs.readFileSync('worker.txt','utf8');
const previewWorkerText=fs.readFileSync('preview33/worker.txt','utf8');
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));
for(const file of ['fonts/nunito-latin-variable.woff2','fonts/OFL-Nunito.txt','fonts/kalam-regular.ttf','fonts/OFL-Kalam.txt'])assert.ok(fs.readFileSync('preview33/'+file).equals(fs.readFileSync(file)),'Preview must include its locally served font and license');
for(const file of ['octi-water-glass.webp','octi-water-mascot.webp','octi-water-motion.mp4','octi-water-motion.webp','octi-water-motion-poster.webp','shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp','shopping-update-button.webp','shopping-close-x-v2.webp','shopping-purchased-note-v3.webp']){
  const bytes=fs.readFileSync(file),hash=require('node:crypto').createHash('sha256').update(bytes).digest('hex').slice(0,16);
  assert.ok(fs.readFileSync('preview33/'+file).equals(bytes),'Preview must contain the exact visual asset');
  assert.ok(preview.includes(file+'?v='+hash),'The rendered artwork must reference the current asset hash');
}

for(const page of [root,preview])assert.doesNotMatch(page,/shopping-paper-tape|shopping-top-tape|shopping-paper-curl|shopping-curl-band|shopping-paper-roll-up/);
assert.equal(fs.existsSync('preview33/shopping-top-tape-v2.webp'),false,'unused top tape must not be published');
assert.equal(fs.existsSync('preview33/shopping-pencil.webp'),false,'the removed pencil must not be published');
assert.match(root,/Aplikacja: 2026\.10\.25\.33\.136-integration/);
assert.match(preview,/Aplikacja: 2026\.10\.25\.33\.136-test/);
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
assert.match(root,/function eventEndFromDuration/);
assert.match(root,/durationMinutes=action\.durationMinutes/);
assert.match(root,/\['list_entries','find_entry','open_event','find_free_time'\]/);
assert.match(root,/shopping-list/);
assert.match(root,/historyModal/);
assert.equal(rootWorkerText,worker,'root worker.txt must exactly match canonical worker.js');
assert.equal(previewWorkerText,worker,'published test Worker must exactly match canonical worker.js');
assert.match(worker,/^\/\/ MÓJ PLANER — WORKER 33\.36-TEST — CONVERSATION 33/);
assert.match(worker,/apiVersion:"2026\.10\.12\.33\.36-test"/);
assert.match(worker,new RegExp(`const BUILD_ID="${release.workerBuildId}"`));
assert.equal(release.version,'2026.10.25.33.136-test');
assert.equal(release.workerVersion,'2026.10.12.33.36-test');
assert.ok(preview.includes("EXPECTED_WORKER_VERSION='"+release.workerVersion+"'"));
assert.ok(preview.includes("EXPECTED_WORKER_BUILD_ID='"+release.workerBuildId+"'"));
assert.equal(release.source,'integration/conversation33/index.html');

console.log('Preview 33.136: generated journal release and isolated storage verified.');
