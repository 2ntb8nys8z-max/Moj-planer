const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const definitions=[
  html.match(/function plannerSearchText\([^\n]+/)[0],
  html.match(/const plannerSearchStops=new Set\([^;]+;/)[0],
  html.match(/const plannerSearchGeneric=new Set\([^;]+;/)[0],
  html.match(/function plannerSearchStem\([^\n]+/)[0],
  html.match(/function plannerSearchScore\([^\n]+/)[0]
].join('\n');
const score=new Function(`${definitions}; return plannerSearchScore;`)();

assert.ok(score('spotkanie z Wojtkiem','Spotkanie z Wojtkiem')>score('spotkanie z Wojtkiem','Zakupy po spotkaniu z Wojtkiem'));
assert.ok(score('spotkanie z Wojtkiem','Zakupy po spotkaniu z Wojtkiem')>0);
assert.equal(score('spotkanie z Wojtkiem','Spotkanie z Zosią'),0);
assert.equal(score('spotkanie','Spotkanie z Wojtkiem'),0,'generic terms must not fan out to broad results');
assert.equal(score('zadania','Test 33.7'),0,'generic record types are not useful title terms');
assert.ok(score('lista zakupów','Lista zakupów')>0,'an exact generic title can still be found');
assert.equal(score('dzisiaj','Spotkanie z Wojtkiem'),0,'date words are not title matches');
assert.equal(score('spotkanie z Wojtkiem','Telefon z Wojtkiem'),0,'the requested event type must also match the title');

console.log('Search 33: named matches rank, unrelated people and generic-only queries do not fan out.');
