const fs=require('node:fs');
const assert=require('node:assert/strict');

const root=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const rootWorkerText=fs.readFileSync('worker.txt','utf8');
const previewWorkerText=fs.readFileSync('preview33/worker.txt','utf8');
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));

assert.match(root,/Aplikacja: 2026\.10\.07\.33\.4-integration/);
assert.match(preview,/Aplikacja: 2026\.10\.07\.33\.4-test/);
assert.match(preview,/generowany automatycznie z kanonicznego frontendu/);
assert.match(preview,/const PREVIEW33_PREFIX='planner-preview-33:'/);
assert.match(preview,/e\.key===PREVIEW33_STORE\.key\(KEY\)/,'storage events must use the preview-prefixed key');
assert.doesNotMatch(preview,/e\.key===KEY/);
assert.match(preview,/\.\.\/sync-core\.js\?v=20261006-29/);
assert.match(preview,/\.\.\/google-calendar\.js\?v=20261006-29/);
assert.match(preview,/delete session\.weatherContext;delete session\.onWeatherAction;delete session\.pendingLocationResult/);
assert.doesNotMatch(preview,/apiInfoCache=\{requiresAccess:true\}/);
assert.equal(rootWorkerText,worker,'root worker.txt must exactly match canonical worker.js');
assert.equal(previewWorkerText,worker,'published test Worker must exactly match canonical worker.js');
assert.match(worker,/^\/\/ MÓJ PLANER — WORKER 33\.4-TEST — CONVERSATION 33/);
assert.match(worker,new RegExp(`const BUILD_ID="${release.workerBuildId}"`));
assert.equal(release.version,'2026.10.07.33.4-test');
assert.equal(release.source,'integration/conversation33/index.html');

console.log('Preview 33.4: generated full UI, isolated storage and canonical Worker are aligned.');
