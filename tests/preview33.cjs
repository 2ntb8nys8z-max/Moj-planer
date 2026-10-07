const fs=require('node:fs');
const assert=require('node:assert/strict');

const root=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const workerText=fs.readFileSync('preview33/worker.txt','utf8');
const release=JSON.parse(fs.readFileSync('preview33/release.json','utf8'));

assert.match(root,/Aplikacja: 2026\.10\.06\.31/,'production label must remain untouched');
assert.match(preview,/Aplikacja: 2026\.10\.07\.33\.1-test/);
assert.match(preview,/planner-preview-33:/);
assert.match(preview,/\.\.\/sync-core\.js\?v=20261006-29/);
assert.match(preview,/\.\.\/google-calendar\.js\?v=20261006-29/);
assert.match(preview,/delete session\.weatherContext;delete session\.onWeatherAction;delete session\.pendingLocationResult/);
assert.doesNotMatch(preview,/apiInfoCache=\{requiresAccess:true\}/);
assert.equal(workerText,worker,'published test Worker must exactly match canonical worker.js');
assert.match(worker,/^\/\/ MÓJ PLANER — WORKER 33\.1-TEST — CONVERSATION 33/);
assert.match(worker,new RegExp(`const BUILD_ID="${release.workerBuildId}"`));
assert.equal(release.version,'2026.10.07.33.1-test');

console.log('Preview 33.1: isolated UI, canonical Worker and release identity are aligned.');
