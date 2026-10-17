import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('worker.js','utf8').replace('export default','const workerDefault =');
const ctx=vm.createContext({});vm.runInContext(source,ctx);
const history=[{role:'assistant',content:'Czy chodzi o 01:00 czy 13:00?'}];
for(const [text,want] of [['01:00','01:00'],['13:00','13:00'],['Na pierwszą.','01:00'],['Na trzynastą.','13:00'],['pierwsza opcja','01:00'],['druga opcja','13:00'],['pierwsza po południu','13:00'],['pierwsza p.m.','13:00'],['1 PM','13:00'],['1 AM','01:00'],['12 AM','00:00'],['12 PM','12:00']])assert.equal(ctx.conversationHourChoice(text,{activeHourChoice:{choices:['01:00','13:00']}},history),want,text);
assert.equal(ctx.conversationHourChoice('Na pierwszą.',{},[]),null);
assert.equal(ctx.conversationHourChoice('Dlaczego pierwsza?',{},history),null);
console.log('Hour choice 33.26: contextual choices and AM/PM pass.');

assert.equal(ctx.conversationHourChoice('pierwsza opcja',{activeHourChoice:{choices:['13:00','01:00']}},[]),'13:00');
assert.equal(ctx.conversationHourChoice('Na pierwszą.',{},history),null,'Old conversation text cannot resurrect a choice');
