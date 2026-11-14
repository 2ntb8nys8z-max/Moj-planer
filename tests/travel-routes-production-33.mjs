import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('travel-routes.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const preview=fs.readFileSync('preview33/index.html','utf8');

assert.match(html,/travel-routes\.js\?v=[a-f0-9]{16}/,'Production loads the versioned route connector');
assert.match(preview,/travel-routes\.js\?v=[a-f0-9]{16}/,'Preview loads the same route connector');
assert.match(source,/\/routes\/compute/,'Connector uses the protected Google Routes endpoint');
for(const mode of ['drive','walk','bicycle','transit'])assert.match(source,new RegExp(mode+':'),'All four travel modes remain available');
assert.match(source,/state\.minutes>gap\?'late'/,'Late journeys are marked red');
assert.match(source,/state\.minutes\+10>gap\?'tight'/,'Small buffers are marked orange');
assert.match(source,/:'safe'/,'Safe journeys retain their risk state');
assert.doesNotMatch(source,/travel-trial-toolbar|function demo\(/,'Production has no test toolbar or demo event replacement');
assert.match(source,/localStorage\.setItem\(modeKey/,'Selected travel mode persists without changing event data');
assert.match(source,/okti-route-spinner/,'Recalculation has a visible working state');
assert.match(source,/\{hidden:true\}/,'An empty Google route hides the connector instead of showing a false no-route badge');
assert.match(source,/if\(state\?\.hidden\)continue/,'Same-place empty routes draw neither a line nor a badge');

console.log('Production travel connector: real routes, four modes, risk colors, spinner and no test toolbar passed.');
