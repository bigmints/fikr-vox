import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {modelTranscription,transcriptionModels,validateModelTranscription} from '../public/model-transcription.js';
import {createApp} from '../server.mjs';

test('saved model transcription is independent of studio defaults; legacy choices remain readable',()=>{
 const settings={transcriptionProvider:'openrouter',listeningModel:'legacy/listen'};
 const profile={transcription:{provider:'local',model:'whisper-small'}};
 assert.deepEqual(modelTranscription(profile,settings),profile.transcription);
 assert.deepEqual(modelTranscription({},settings),{provider:'openrouter',model:'legacy/listen'});
 const choice=modelTranscription(profile,settings);choice.model='changed';assert.equal(profile.transcription.model,'whisper-small');
 assert.throws(()=>validateModelTranscription({provider:'local',model:'kokoro'}),/Whisper/);
 assert.throws(()=>validateModelTranscription({provider:'https://example.com',model:'a'}),/Choose/);
 assert.throws(()=>validateModelTranscription({provider:'openrouter',model:''}),/Choose/);
 assert.deepEqual(transcriptionModels({providers:[{id:'api:one',models:[{id:'speech',kind:'speech'},{id:'listen',kind:'transcription'}]}]},'api:one'),[{id:'listen',kind:'transcription'}]);
});

test('profiles persist separate transcription settings and explicit requests override global models',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vox-model-transcription-')),requests=[];
 await writeFile(join(dir,'secrets.json'),JSON.stringify({openrouterKey:'dummy-key'}));
 const app=await createApp({dataDir:dir,fetcher:async(url,options)=>{const body=options.body instanceof FormData?{model:options.body.get('model')}:JSON.parse(options.body);requests.push([url,body]);return Response.json(options.body instanceof FormData?{text:'Managed transcript'}:{choices:[{message:{content:'Recognized words'}}]});}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>app.server.close(r));await rm(dir,{recursive:true,force:true});});
 const call=async(path,method,body)=>{const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 await app.store.update(s=>{s.settings.listeningModel='old/default';s.settings.catalog={models:['old/default','profile/listen'].map(id=>({id,inputs:['audio'],outputs:['text'],endpoints:['/api/v1/chat/completions']}))};s.assets=[{id:'reference',type:'audio/wav'}];});
 await writeFile(join(dir,'media','reference'),'mock audio');
 const first=await call('/profiles','POST',{name:'Host',transcription:{provider:'local',model:'whisper-small'}});
 const second=await call('/profiles','POST',{name:'Guest',transcription:{provider:'openrouter',model:'profile/listen'}});
 assert.equal(first.status,201);assert.equal(second.status,201);
 assert.equal((await call(`/profiles/${first.data.id}`,'PUT',{name:'Renamed host'})).data.transcription.model,'whisper-small');
 assert.equal((await call('/profiles','POST',{name:'Invalid',transcription:{provider:'local',model:'speech'}})).status,400);
 const result=await call('/listen','POST',{...second.data.transcription,assetId:'reference'});
 assert.equal(result.status,200);assert.equal(requests[0][1].model,'profile/listen');
 const managed=await call('/providers/save','POST',{type:'custom',name:'Test provider',baseUrl:'http://localhost:1234/v1',models:[{id:'first',kind:'transcription'},{id:'second',kind:'transcription'}]});
 assert.equal(managed.status,200);
 const managedResult=await call('/listen','POST',{provider:managed.data.id,model:'second',assetId:'reference'});
 assert.equal(managedResult.status,200);assert.equal(requests[1][1].model,'second');
 assert.equal((await call('/listen','POST',{provider:managed.data.id,model:'not-configured',assetId:'reference'})).status,400);
 assert.equal(app.store.read().settings.listeningModel,'old/default');
 const restored=await createApp({dataDir:dir});assert.equal(restored.store.read().profiles.find(p=>p.id===second.data.id).transcription.model,'profile/listen');restored.server.emit('close');
});
