const fs=require('node:fs');
const assert=require('node:assert/strict');

const root=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const rootWorkerText=fs.readFileSync('worker.txt','utf8');
const previewWorkerText=fs.readFileSync('preview33/worker.txt','utf8');
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));
for(const file of ['fonts/nunito-latin-variable.woff2','fonts/OFL-Nunito.txt','fonts/kalam-regular.ttf','fonts/OFL-Kalam.txt'])assert.ok(fs.readFileSync('preview33/'+file).equals(fs.readFileSync(file)),'Preview must include its locally served font and license');
for(const file of ['header-sailboat.webp','octi-water-glass.webp','octi-water-mascot.webp','octi-actor-poster.webp','octi-glass-33-184.png','octi-caustic-33-196.svg','shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp','shopping-update-button.webp','shopping-close-x-v2.webp','shopping-purchased-note-v3.webp']){
  const bytes=fs.readFileSync(file),hash=require('node:crypto').createHash('sha256').update(bytes).digest('hex').slice(0,16);
  assert.ok(fs.readFileSync('preview33/'+file).equals(bytes),'Preview must contain the exact visual asset');
  assert.ok(preview.includes(file+'?v='+hash),'The rendered artwork must reference the current asset hash');
}

for(const page of [root,preview])assert.doesNotMatch(page,/shopping-paper-tape|shopping-top-tape|shopping-paper-curl|shopping-curl-band|shopping-paper-roll-up/);
assert.equal(fs.existsSync('preview33/shopping-top-tape-v2.webp'),false,'unused top tape must not be published');
assert.equal(fs.existsSync('preview33/shopping-pencil.webp'),false,'the removed pencil must not be published');
assert.match(root,/Aplikacja: 2026\.11\.04\.33\.217-integration/);
assert.match(preview,/Aplikacja: 2026\.11\.04\.33\.217-test/);
for(const page of [root,preview]){
  assert.match(page,/\.phone-layout \.app\{padding-bottom:0\}/,'the scrolling views must continue through the full height of the glass navigation');
  assert.doesNotMatch(page,/\.phone-layout \.app\{padding-bottom:calc\(88px \+ max\(0px,var\(--phone-bottom-inset\)\)\)\}/,'the app must not insert an opaque bar-height layer above the navigation');
  assert.match(page,/\.phone-bottom-bar\{[^}]*background:#b8d4e404[^}]*backdrop-filter:blur\(3\.5px\)/,'the glass bar must use the requested midpoint milkiness');
  assert.match(page,/bottom:max\(4px,calc\(env\(safe-area-inset-bottom\) - 14px\)\)/,'the glass bar should use the previously wasted lower safe-area space');
  assert.match(page,/filter:drop-shadow\(0 0 1px #fff\) drop-shadow\(0 0 2px #fff\)/,'navigation icons need a light edge over dark scrolling content');
  assert.match(page,/phone-week-digit\.roll-forward/,'week numbers need a forward mechanical drum animation');
  assert.match(page,/phone-week-digit\.roll-back/,'week numbers need a reverse mechanical drum animation');
  assert.match(page,/slot\.setAttribute\('aria-hidden','true'\)/,'animated week digits must not duplicate the accessible week label');
  assert.match(page,/function announcePhoneDayWeather\(\)\{[^}]*toast\(/,'the weather button must use the app notification');
  assert.match(page,/grid-template-columns:44px minmax\(0,1fr\) 44px/,'the weather control must reserve more width for long weekday names');
  assert.match(page,/\.phone-day-weekday\{[^}]*font-size:clamp\(19px,6\.15vw,24px\)/,'every weekday must use the size chosen for Monday');
  assert.doesNotMatch(page,/phone-day-weekday\.long/,'weekday typography must not resize when the selected day changes');
  assert.match(page,/\.phone-layout \.daybar h2\{[^}]*background:#b8d4e404[^}]*backdrop-filter:blur\(1\.5px\)/,'the weather button must keep the sky visible through its clear center');
  assert.match(page,/\.phone-layout \.daybar h2:before\{[^}]*padding:3px[^}]*backdrop-filter:blur\(7px\)/,'the weather button must concentrate refraction in its glass rim');
  assert.match(page,/calendarMonth=document\.createElement\('span'\)/,'the month label must be plain text rather than a button');
  assert.match(page,/\.phone-layout \.phone-calendar-month\{[^}]*top:59px[^}]*border:0[^}]*background:none[^}]*font:750 21px/,'the larger plain month label must sit under the week bubble');
  assert.match(page,/className='phone-day-speaker'/,'the day summary keeps a visible speaker control');
  assert.match(page,/\.phone-day-weather \.weather-icon\{width:52px;height:52px\}/,'the selected-day weather symbol must remain large and legible');
  assert.match(page,/#dayTitle \.phone-day-weekday\{[^}]*font-size:clamp\(20px,6vw,27px\)/,'the sliding weekday must keep its original large type');
  assert.match(page,/#dayTitle \.phone-day-weather \.weather-icon\{width:52px;height:52px/,'the sliding weather artwork must keep its original 52px size');
  assert.match(page,/#dayTitle \.phone-day-temperature\{font-size:27px;min-width:42px/,'the sliding temperature must keep its original size');
  assert.match(page,/function plannerWeatherArtwork\(kind,day=true\)\{return oktiWeatherArtwork\(kind,day\)\}/,'event and header weather share the approved icon family');
  assert.match(page,/function oktiWeatherArtwork\(kind,day=true\)/,'shaded icon renderer must be published in both builds');
  assert.match(page,/background:linear-gradient\(145deg,#fffdfa,#e8ecef\);color:#17366b/,'the nested speaker must use pearl silver with a restrained navy glyph');
  assert.match(page,/#dayView \.daybar>\.navbutton:not\(#todayBtn\)\{display:none\}/,'the redundant day arrows must stay hidden');
  assert.match(page,/\.phone-layout \.app\{background:#fbfaf8\}/,'the planning area must use the calm warm-white production surface');
}
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
assert.equal(release.version,'2026.11.04.33.217-test');
assert.equal(release.workerVersion,'2026.10.12.33.36-test');
assert.ok(preview.includes("EXPECTED_WORKER_VERSION='"+release.workerVersion+"'"));
assert.ok(preview.includes("EXPECTED_WORKER_BUILD_ID='"+release.workerBuildId+"'"));
assert.equal(release.source,'integration/conversation33/index.html');

for(const file of ['octi-listening.js','octi-listening-body.mp4','octi-listening-head.webp','octi-listening-background.webp','octi-listening-fallback.webp','octi-listening-poster.webp'])assert.ok(fs.readFileSync('preview33/'+file).equals(fs.readFileSync(file)),'Listening artwork and controller must be published together');
assert.match(preview,/src="octi-listening\.js\?v=[a-f0-9]{16}"/);
assert.ok(fs.readFileSync('preview33/octi-liquid-sphere-33-182.png').equals(fs.readFileSync('octi-liquid-sphere-33-182.png')),'The smooth transparent liquid sphere must be published with the UI');
assert.ok(fs.readFileSync('preview33/octi-glass-33-184.png').equals(fs.readFileSync('octi-glass-33-184.png')),'The approved pale-blue glass sphere must be published with the UI');
assert.ok(fs.readFileSync('preview33/octi-caustic-33-196.svg').equals(fs.readFileSync('octi-caustic-33-196.svg')),'The bright lens caustic must be published with the UI');
console.log('Preview 33.217: widened timeline edges and unclipped corner reminder bell verified.');

