import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { inspectDatabase } from '../scripts/check-shopping-migration.mjs';

const sql = readFileSync(new URL('../migrations/shopping/001-checkpoint.sql',import.meta.url),'utf8');
const html = readFileSync(new URL('../kopia-zakupow.html',import.meta.url),'utf8');
const originalTable = 'CREATE TABLE shared_shopping (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL)';
const shared = {rows:[{key:'a', text:'Chleb', done:true, by:'Zosia', buyer:'first'}], title:'Kolacja',
  participants:{first:'Zosia',second:'  ZOSIA ',third:'Łucja'}, invites:{
    a:{group:'g', actor:'first',canAdd:true}, b:{group:'g',actor:'second',canAdd:false,revoked:true},
    c:{group:'g',actor:null,canAdd:true}, d:{actor:null,canAdd:false}, e:{actor:'third',canAdd:true}
  }, openLinks:{old:{canAdd:true}}, blocked:{second:{canAdd:false}}, authors:{a:'first'},
  added:{a:'old-product-id'}, removedIds:['deleted-product'], joinEvents:[{key:'a',nick:'Zosia',revision:3}],
  futureMetadata:{keep:'verbatim'}};
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(originalTable);
  const add=db.prepare('INSERT INTO shared_shopping VALUES (?,?,?)');
  add.run('old',1, JSON.stringify({rows:[],participants:{}}));
  add.run('group',10, JSON.stringify(shared,null,2));
  return db;
}

test('Checkpoint retains all original bytes, revisions and extra fields, and restores to a clean database',()=>{
  const db=fixture(), restored=new DatabaseSync(':memory:');
  try {
    const rows=()=>db.prepare('SELECT * FROM shared_shopping ORDER BY id').all();
    const before=rows();
    db.exec(sql); db.exec(sql);
    assert.deepEqual(rows(),before);
    assert.equal(db.prepare('SELECT count(*) AS n FROM shopping_v1_checkpoints').get().n,2);
    assert.deepEqual(inspectDatabase(db), {lists:2,checkpointMatches:2,malformed:0,products:1,purchased:1,
      legacyAnonymous:1,unlimitedLinks:1,unclaimedSeats:2,joinedPeople:3,removedPeople:1,nicknameCollisions:1,hasCheckpoint:true});
    restored.exec(originalTable);
    const put=restored.prepare('INSERT INTO shared_shopping VALUES (?,?,?)');
    for(const row of db.prepare('SELECT * FROM shopping_v1_checkpoints').iterate()) put.run(row.list_id,row.revision,row.content);
    assert.deepEqual(restored.prepare('SELECT * FROM shared_shopping ORDER BY id').all(),before);
    db.prepare('UPDATE shared_shopping SET revision=11,content=? WHERE id=?').run(JSON.stringify({...shared,title:'Nowa nazwa'}),'group');
    assert.equal(inspectDatabase(db).checkpointMatches,1);
    db.exec(sql);
    assert.equal(db.prepare('SELECT count(*) AS n FROM shopping_v1_checkpoints').get().n,3);
    assert.deepEqual(restored.prepare('SELECT * FROM shared_shopping ORDER BY id').all(),before);
  } finally {db.close();restored.close();}
});

test('Conflicting revisions fail atomically, corrupt records survive intact, and inspection is read-only',()=>{
  const db=fixture();
  try {
    assert.equal(inspectDatabase(db).hasCheckpoint,false);
    db.exec(sql);
    db.exec("INSERT INTO shared_shopping VALUES ('extra',1,'broken'); UPDATE shared_shopping SET content='different' WHERE id='group'");
    assert.throws(()=>db.exec(sql),/UNIQUE/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM shopping_v1_checkpoints').get().n,2);
    db.exec("UPDATE shared_shopping SET revision=11 WHERE id='group'");
    db.exec(sql);
    db.exec('PRAGMA query_only=ON');
    const report=inspectDatabase(db);
    assert.equal(report.malformed,2);
    assert.equal(report.checkpointMatches,3);
    assert.equal(db.prepare("SELECT content FROM shopping_v1_checkpoints WHERE list_id='extra'").get().content,'broken');
  } finally {db.close();}
});

const ideas=[
  {id:'entry',title:'Sobota', text:'Prywatna treść wpisu', history:[{summary:'Kupiono mleko'}], list:{type:'shopping',items:[
    {id:10,text:'Mleko',done:true,shoppingBuyer:'Zosia'}, {id:11,text:'Mleko',done:false}]}},
  {id:'shared-shopping-demo',list:{type:'shopping',items:[
    {id:'new',text:'Chleb',done:false,shoppingGuestKey:'k',shoppingAuthorName:'Ada'},
    {id:'local',text:'Ryż',done:false}]}},
  {id:'unrelated',text:'Niezwiązana notatka'}
];
const domain='https://2ntb8nys8z-max.github.io';
function page(url) {return new JSDOM(html,{url,runScripts:'dangerously'}).window;}
test('Device copy reads the exact installation, retains mixed sources and credentials stay on device',()=>{
  for(const [directory,prefix] of [['/Moj-planer/',''],['/Moj-planer/preview33/','planner-preview-33:']]) {
    const w=page(domain+directory+'kopia-zakupow.html');
    try {
      const storage=w.localStorage, key='okti-shopping:'+directory+':';
      storage.setItem(prefix+'moj-planer-data-v1',JSON.stringify({version:1,data:{ideas,tasks:['private-calendar']}}));
      storage.setItem(key+'id','old-list');
      storage.setItem(key+'base','[  ]');
      storage.setItem(key+'owner','owner-secret');
      storage.setItem('okti:uczestnik:old-list','guest-secret');
      const before={...storage}, copy=w.eval('deviceCheckpoint()');
      assert.equal(copy.sources.length,2);
      assert.equal(copy.sources[1].list.items.length,2);
      assert.deepEqual(JSON.parse(JSON.stringify(copy.sources[0].list)),ideas[0].list);
      assert.deepEqual(JSON.parse(JSON.stringify(copy.sources[0].history)),ideas[0].history);
      assert.equal(copy.legacy.base,'[  ]');assert.equal(copy.legacy.id,'old-list');
      assert.doesNotMatch(JSON.stringify(copy),/secret|private-calendar|Prywatna treść wpisu|Niezwiązana/);
      w.stored=copy;
      assert.deepEqual(w.eval('readFileData(stored)'),copy);
      assert.deepEqual({...storage},before);
      storage.removeItem(prefix+'moj-planer-data-v1');
      storage.setItem(prefix+'moj-planer-ideas',JSON.stringify(ideas));
      assert.deepEqual(w.eval('deviceCheckpoint().sources'),copy.sources);
      storage.setItem(prefix+'moj-planer-data-v1','{');
      assert.throws(()=>w.eval('deviceCheckpoint()'));
    } finally {w.close();}
  }
});

test('Preview reads only an explicitly chosen backup or fixture and refuses damaged or unknown versions',async()=>{
  const w=page('https://preview.example/kopia-zakupow.html');
  try{
    assert.equal(w.document.querySelector('#device').hidden,true);
    assert.throws(()=>w.eval('deviceCheckpoint()'));
    w.document.querySelector('#demo').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(w.document.querySelector('#pending').textContent,'2');
    assert.equal(w.document.querySelector('#signed').textContent,'1');
    w.backup={format:'moj-planer-backup',version:1,data:{ideas}};
    assert.equal(w.eval('readFileData(backup).legacy'),null);
    assert.equal(w.eval('readFileData(backup).sources.length'),2);
    w.backup={...w.backup,version:2};assert.throws(()=>w.eval('readFileData(backup)'));
    assert.throws(()=>w.eval("makeCheckpoint([{id:'a',list:{type:'shopping',items:[null]}}],null)"));
  }finally{w.close();}
});
