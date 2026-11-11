import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {collectionAction} from '../lib/collection-actions.mjs';
import {spendingRows,spendingSummary} from '../public/spending-model.js';

function sample(){return {projects:[{id:'p',title:'Episode',projectType:'podcast',profileId:'t',podcast:{speakers:[{id:'host',profileId:'t'}]},tracks:[{id:'voice',profileId:'t'}],sections:[{id:'s',text:'Hello',voiceTakeId:'j',pendingVoiceTakeId:'pending',trims:{j:{start:0,end:2}}},{id:'split',sourceSectionId:'s',sourceTakeId:'j',audioAssetId:'audio',offset:2}]}],profiles:[{id:'t',name:'My voice',voiceAssetId:'reference',voiceProvider:'local',localEngine:'omnivoice',voiceDesign:{text:'Warm'},voicePreviewJobId:'preview'}],jobs:[{id:'j',projectId:'p',sectionId:'s',profileId:'t',kind:'voice',status:'completed',outputId:'audio',approved:true,provider:'openrouter',usage:{cost:0.5},createdAt:'2026-11-06'},{id:'pending',projectId:'p',sectionId:'s',profileId:'t',status:'prepared'}],assets:[{id:'audio'},{id:'reference'}],settings:{}};}

test('project copy remaps take links, trims and splits, preserves media, and does not duplicate charges',()=>{
 const s=sample(),original=structuredClone(s.projects[0]);
 const copy=collectionAction(s,'projects','p','duplicate'),take=s.jobs.find(j=>j.projectId===copy.id);
 assert.notEqual(copy.id,'p');assert.equal(copy.title,'Episode · copy');
 assert.notEqual(copy.sections[0].id,'s');assert.equal(copy.sections[0].voiceTakeId,take.id);
 assert.deepEqual(copy.sections[0].trims[take.id],{start:0,end:2});
 assert.equal(copy.sections[1].sourceSectionId,copy.sections[0].id);assert.equal(copy.sections[1].sourceTakeId,take.id);
 assert.equal(copy.sections[1].audioAssetId,'audio');assert.equal(copy.sections[0].pendingVoiceTakeId,undefined);
 assert.equal(s.jobs.filter(j=>j.projectId===copy.id).length,1);assert.equal(take.approved,true);
 assert.equal(spendingSummary(spendingRows(s.jobs)).total,0.5);
 assert.deepEqual(s.projects.find(p=>p.id==='p'),original);assert.equal(s.assets.length,2);
});
test('model copy keeps voice configuration, while edits remain independent',()=>{
 const s=sample(),copy=collectionAction(s,'profiles','t','duplicate');
 assert.notEqual(copy.id,'t');assert.equal(copy.name,'My voice · copy');assert.equal(copy.voicePreviewJobId,'preview');
 copy.voiceDesign.text='Soft';assert.equal(s.profiles[0].voiceDesign.text,'Warm');
});
test('deletion guards live jobs and all model assignment locations, retaining completed history and media',()=>{
 for(const assignment of ['project','speaker','track']){
  const s=sample(),p=s.projects[0];p.profileId='';p.podcast.speakers[0].profileId='';p.tracks[0].profileId='';
  if(assignment==='project')p.profileId='t';if(assignment==='speaker')p.podcast.speakers[0].profileId='t';if(assignment==='track')p.tracks[0].profileId='t';
  assert.throws(()=>collectionAction(s,'profiles','t','delete'),/used by/);
 }
 for(const status of ['submitting','queued','running','cancel_requested','waiting']){
  const s=sample();s.jobs[1].status=status;
  assert.throws(()=>collectionAction(s,'projects','p','delete'),/queued or running/);assert.equal(s.projects.length,1);
 }
 const s=sample();collectionAction(s,'projects','p','delete');collectionAction(s,'profiles','t','delete');
 assert.equal(s.projects.length,0);assert.equal(s.profiles.length,0);assert.equal(s.jobs.length,1);assert.equal(s.assets.length,2);
});
test('browser API persists duplicate/delete, reports conflicts and missing records',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vox-collections-')),app=await createApp({dataDir:dir});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));await rm(dir,{recursive:true,force:true});});
 await app.store.update(s=>Object.assign(s,sample()));
 const call=async(path,method)=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}/api${path}`,{method});return {status:r.status,body:await r.json()};};
 const copy=await call('/projects/p/duplicate','POST');assert.equal(copy.status,201);
 assert.equal((await call('/profiles/t','DELETE')).status,409);
 assert.equal((await call(`/projects/${copy.body.id}`,'DELETE')).status,200);
 assert.equal((await call('/projects/p','DELETE')).status,200);
 assert.equal((await call('/profiles/t/duplicate','POST')).status,201);
 assert.equal((await call('/profiles/t','DELETE')).status,200);
 assert.equal((await call('/profiles/t','DELETE')).status,404);
 const disk=JSON.parse(await readFile(join(dir,'studio.json'),'utf8'));assert.equal(disk.projects.length,0);assert.equal(disk.profiles.length,1);assert.equal(disk.assets.length,2);
});
