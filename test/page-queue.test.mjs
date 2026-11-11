import test from 'node:test';
import assert from 'node:assert/strict';
import {queueSelection,queueJobActions} from '../public/page-queue.js';
const jobs=[{id:'live',kind:'voice',status:'running',projectTitle:'Interview',engine:'kokoro'},{id:'wait',kind:'video',status:'prepared',projectTitle:'Interview'},{id:'good',kind:'dub',status:'completed',projectTitle:'Film'},{id:'bad',kind:'voice',status:'failed',sectionTitle:'Opening',projectTitle:'Interview'},{id:'shot',kind:'video',status:'completed',parentVideoId:'wait'}];
test('queue filters intersect type, status and search without exposing sequence child jobs',()=>{
 const all=queueSelection(jobs);assert.equal(all.active.length,1);assert.equal(all.waiting.length,1);assert.equal(all.history.length,2);
 assert.deepEqual(queueSelection(jobs,{type:'video',status:'completed',search:'film'}).history.map(j=>j.id),['good']);
 assert.deepEqual(queueSelection(jobs,{type:'audio',status:'failed',search:'interview opening'}).history.map(j=>j.id),['bad']);
 assert.equal(queueSelection(jobs,{status:'active',search:'KOKORO'}).active[0].id,'live');
 assert.equal(Object.values(queueSelection(jobs,{search:'not-found'})).flat().length,0);
});
test('queue actions follow provider support without offering cancellation of completed or failed jobs',()=>{
 assert.deepEqual(queueJobActions({provider:'local',kind:'voice',status:'prepared'}),{start:true,cancel:true,refresh:false});
 assert.deepEqual(queueJobActions({provider:'openrouter',kind:'video',status:'running'}),{start:false,cancel:false,refresh:true});
 assert.equal(queueJobActions({provider:'worker',kind:'voice',status:'failed'}).start,true);
 assert.equal(queueJobActions({provider:'worker',kind:'voice',status:'failed'}).cancel,false);
 assert.equal(queueJobActions({kind:'dub',status:'running'}).cancel,false);
 assert.equal(queueJobActions({kind:'avatar',engine:'infinitetalk',status:'prepared'}).start,false);
 assert.equal(queueJobActions({kind:'video',status:'completed'}).cancel,false);
});
