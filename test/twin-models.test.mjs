import test from 'node:test';
import assert from 'node:assert/strict';
import {twinVoiceModels,twinCloudVoiceSettings,cloudVoiceChoices,twinLanguages} from '../public/twin-models.js';
import {savedLocalVoice} from '../lib/local-tts.mjs';
test('provider model choices contain only usable speech engines',()=>{
 const state={settings:{catalog:{models:[{id:'speech',name:'Speech',outputs:['speech'],endpoints:['/api/v1/audio/speech']},{id:'chat',outputs:['text'],endpoints:['/api/v1/chat/completions']},{id:'audio',outputs:['speech'],endpoints:[]}]},capabilities:{engines:[{id:'ready',kind:'voice',ready:true},{id:'offline',kind:'voice',ready:false},{id:'avatar',kind:'avatar',ready:true}]}}};
 assert.deepEqual(twinVoiceModels('openrouter',state).map(m=>m.id),['speech']);
 assert.deepEqual(twinVoiceModels('worker',state).map(m=>m.id),['ready']);
 assert.equal(twinVoiceModels('voicestudio',state)[0].id,'omnivoice');
});
test('per-twin provider model and preset preferences survive profile validation',()=>{
 const settings={voiceProvider:'openrouter',speechModel:'provider/model',voiceMode:'preset',voice:'warm'};
 const fields=savedLocalVoice(settings,{assets:[],jobs:[]});
 assert.equal(fields.speechModel,settings.speechModel);assert.equal(fields.voiceMode,'preset');assert.equal(fields.voice,'warm');
 assert.throws(()=>twinCloudVoiceSettings({...settings,voiceMode:'unavailable'}),/preset/);
 assert.throws(()=>savedLocalVoice({...settings,speechModel:'x'.repeat(201)},{}),e=>e.status===400);
});

test('language filters models and presets while retaining multilingual and unknown support',()=>{
 const models=[{id:'english',languages:['en'],voices:['alice']},{id:'multilingual',languages:{en:'English',ml:'Malayalam'},voices:['both','english','malayalam'],voiceLanguages:{english:'en',malayalam:['ml']}},{id:'unknown',voices:['unlisted']}].map(m=>({...m,outputs:['speech'],endpoints:['/api/v1/audio/speech']}));
 const state={settings:{catalog:{models}}};
 assert.deepEqual(twinVoiceModels('openrouter',state,'ml').map(m=>m.id),['multilingual','unknown']);
 assert.deepEqual(cloudVoiceChoices(models[0],'ml'),[]);
 assert.deepEqual(cloudVoiceChoices(models[1],'ml'),['both','malayalam']);
 assert.deepEqual(cloudVoiceChoices(models[2],'ml'),['unlisted']);
});
test('Malayalam preference survives profile validation and invalid languages fail',()=>{
 assert.equal(savedLocalVoice({voiceProvider:'voicestudio',voiceLanguage:'ml'},{}).voiceLanguage,'ml');
 assert.equal(savedLocalVoice({voiceProvider:'local',localEngine:'kokoro',localVoice:'hf_alpha',localVoiceLanguage:'hi'},{}).voiceLanguage,'hi');
 assert.throws(()=>twinCloudVoiceSettings({voiceLanguage:'invalid'}),/language/);
});

test('expanded language preferences have compatible local cloning and native-script previews',async()=>{
 const {localCatalog,validateLocal}=await import('../lib/local-tts.mjs');
 const {isLocalClone,previewTexts}=await import('../public/local-voices.js');
 assert.ok(isLocalClone('omnivoice'));assert.equal(twinLanguages.length,32);
 for(const [id,label] of twinLanguages){assert.equal(localCatalog.omnivoice.languages[id],label);assert.ok(previewTexts[id]);assert.equal(twinCloudVoiceSettings({voiceLanguage:id}).voiceLanguage,id);assert.doesNotThrow(()=>validateLocal({kind:'voice',engine:'omnivoice'},id,'Exact words.'));}
 assert.throws(()=>validateLocal({kind:'voice',engine:'qwen3'},'ml','Exact words.'),/language/);
});

test('added speech providers use their own models and account voices',async()=>{
 const {apiSpeechSettings,apiProviderModels}=await import('../public/twin-models.js');const settings={voiceProvider:'api:eleven',speechModel:'legacy/openrouter',voice:'legacy-voice',providers:[{id:'api:eleven',name:'ElevenLabs',models:[{id:'eleven_multilingual_v2',name:'Multilingual',kind:'speech',voices:['alice'],voiceLabels:{alice:'Alice'}}],defaultModels:{speech:'eleven_multilingual_v2'}}]};
 assert.equal(apiSpeechSettings(settings).speechModel,'eleven_multilingual_v2');assert.equal(apiSpeechSettings(settings).voice,'');assert.equal(apiSpeechSettings(settings,{voice:'alice'}).voice,'alice');assert.equal(apiSpeechSettings(settings,{voiceProvider:'local'}),null);assert.equal(apiProviderModels(settings,'api:eleven')[0].outputs[0],'speech');assert.equal(twinVoiceModels('api:eleven',{settings},'ml')[0].voiceLabels.alice,'Alice');
});
