import {voiceStudioUrl} from './voicestudio.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {id,now} from './store.mjs';
import {decodeAudio} from './openrouter.mjs';

export const providerPresets=JSON.parse(await readFile(new URL('./provider-presets.json',import.meta.url),'utf8'));
export const higgsfieldCatalog=JSON.parse(await readFile(new URL('./higgsfield-catalog.json',import.meta.url),'utf8'));
export const isApiProvider=value=>typeof value==='string'&&value.startsWith('api:');
const fail=message=>Object.assign(new Error(message),{status:400});
const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const voices=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse'];
export function providerUrl(value){
  let url;try{url=new URL(value);}catch{throw fail('Enter a valid API base URL.');}
  const local=/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\..+|192\.168\..+|172\.(1[6-9]|2\d|3[01])\..+)$/.test(url.hostname)||url.hostname.endsWith('.local');
  if(!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!local||url.username||url.password||url.search||url.hash)throw fail('Use HTTPS, or HTTP for a local server, without credentials or query parameters.');
  return url.href.replace(/\/+$/,'');
}
function config(body,existing){
  const type=text(body.type||existing?.type),preset=providerPresets[type];if(!preset)throw fail('Choose a supported provider.');
  const baseUrl=providerUrl(type==='custom'?body.baseUrl||existing?.baseUrl:preset.baseUrl);
  return {id:existing?.id||'',type,name:text(body.name)||existing?.name||preset.name,baseUrl,protocol:preset.protocol};
}
function cleanModel(model,preset){
  if(preset.protocol==='higgsfield'){const known=higgsfieldCatalog.find(m=>m.id===model.id);if(!known)throw fail('Choose a supported Higgsfield video model.');return structuredClone(known);}
  const modelId=text(model.id);if(!modelId||/[\r\n]/.test(modelId))throw fail('Enter a valid model ID.');
  const kind=model.kind||'chat';if(!preset.kinds.includes(kind))throw fail('This provider does not support that model type.');
  return {id:modelId,name:text(model.name)||modelId,kind,voices:Array.isArray(model.voices)?model.voices.filter(v=>typeof v==='string'&&v.length<=200).slice(0,200):kind==='speech'&&preset.protocol==='openai'?voices:[],voiceLabels:Object.fromEntries(Object.entries(model.voiceLabels||{}).slice(0,200).map(([k,v])=>[text(k),text(v)]))};
}
export function createProviders(store,dataDir,secrets,fetcher=fetch){
  const find=providerId=>store.read().settings.providers?.find(p=>p.id===providerId);
  const key=(cfg,body={})=>text(body.apiKey,4000)||(cfg.id&&find(cfg.id)?.baseUrl===cfg.baseUrl?secrets.providerKeys?.[cfg.id]||'':'');
  const headers=(cfg,apiKey)=>cfg.protocol==='anthropic'?{'x-api-key':apiKey,'anthropic-version':'2023-06-01'}:cfg.protocol==='elevenlabs'?{'xi-api-key':apiKey}:apiKey?{Authorization:`Bearer ${apiKey}`}:{ };
  async function request(cfg,apiKey,path,options={}){
    let response;try{response=await fetcher(cfg.baseUrl+path,{signal:AbortSignal.timeout(180000),redirect:'error',...options,headers:{...headers(cfg,apiKey),...options.headers}});}catch{throw fail(`Could not reach ${cfg.name}. Check the API endpoint and connection.`);}
    if(!response.ok)throw fail(`${cfg.name} returned HTTP ${response.status}. Check your key, endpoint, and model access.`);return response;
  }
function voiceStudioConfig(body={}){
  if(body.id&&body.id!=='voicestudio')throw fail('Provider not found.');
  const saved=voiceStudioUrl(store.read().settings.voicestudioUrl||''),baseUrl=voiceStudioUrl(body.baseUrl??saved);
  if(!baseUrl)throw fail('Enter your VoiceStudio server address.');
  const apiKey=text(body.apiKey,4000)||(baseUrl===saved?secrets.voicestudioKey||'':'');
  if(!apiKey)throw fail('Enter your VoiceStudio API key. A new server address needs its own key.');
  return {cfg:{id:'voicestudio',type:'voicestudio',name:'VoiceStudio',baseUrl,protocol:'voicestudio',models:structuredClone(providerPresets.voicestudio.models),defaultModels:{speech:'omnivoice'}},apiKey};
}
  async function discover(body){
  if(body.type==='voicestudio'||body.id==='voicestudio'){const {cfg,apiKey}=voiceStudioConfig(body);await request(cfg,apiKey,'/health');return {models:cfg.models};}
    const cfg=config(body,find(body.id)),apiKey=key(cfg,body);if(cfg.type!=='custom'&&!apiKey)throw fail('Enter your API key.');
    if(cfg.protocol==='higgsfield')return {models:structuredClone(higgsfieldCatalog)};
    const raw=await (await request(cfg,apiKey,'/models')).json();
    let available=Array.isArray(raw)?raw:raw.data;if(!Array.isArray(available))throw fail('The endpoint did not return a model list. You can enter model IDs manually.');
    let providerVoices=[];
    if(cfg.protocol==='elevenlabs'){
      let token='';do{const response=await (await request({...cfg,baseUrl:cfg.baseUrl.replace(/\/v1$/,'/v2')},apiKey,'/voices?page_size=100'+(token?'&next_page_token='+encodeURIComponent(token):''))).json();providerVoices.push(...(response.voices||[]));token=response.has_more?response.next_page_token:'';}while(token&&providerVoices.length<200);providerVoices=providerVoices.slice(0,200);
    }
    const models=available.slice(0,5000).flatMap(model=>{
      const mid=model.id||model.model_id;if(typeof mid!=='string')return [];
      let kind='chat';
      if(cfg.protocol==='elevenlabs'){if(!model.can_do_text_to_speech)return [];kind='speech';}
      else if(/transcrib|whisper/i.test(mid))kind='transcription';
      else if(/tts|text.to.speech/i.test(mid)||model.architecture?.output_modalities?.includes('speech'))kind='speech';
      else if(/embed|dall-e|image|moderation|realtime|sora|veo|imagen|music/i.test(mid))return [];
      if(!providerPresets[cfg.type].kinds.includes(kind))return [];
      return [cleanModel({id:mid,name:model.name||model.display_name||mid,kind,voices:cfg.protocol==='elevenlabs'?providerVoices.map(v=>v.voice_id):model.supported_voices,voiceLabels:Object.fromEntries(providerVoices.map(v=>[v.voice_id,v.name]))},providerPresets[cfg.type])];
    });
    return {models};
  }
  async function save(body){
  if(body.type==='voicestudio'||body.id==='voicestudio'){
    const {cfg,apiKey}=voiceStudioConfig(body);
    if(!Array.isArray(body.models)||body.models.length!==1||body.models[0].id!=='omnivoice'||body.models[0].kind!=='speech')throw fail('Choose the OmniVoice model for VoiceStudio.');
    secrets.voicestudioKey=apiKey;await writeFile(join(dataDir,'secrets.json'),JSON.stringify(secrets),{mode:0o600});
    await store.update(s=>s.settings.voicestudioUrl=cfg.baseUrl);return {...cfg,configured:true};
  }

    const previous=body.id?find(body.id):undefined;if(body.id&&!previous)throw fail('Provider not found.');
    const cfg=config(body,previous),apiKey=key(cfg,body);if(cfg.type!=='custom'&&!apiKey)throw fail('Enter your API key.');
    if(!Array.isArray(body.models)||!body.models.length||body.models.length>100)throw fail('Choose between 1 and 100 models.');
    cfg.models=body.models.map(model=>cleanModel(model,providerPresets[cfg.type]));cfg.defaultModels=Object.fromEntries(Object.entries(previous?.defaultModels||{}).filter(([kind,id])=>cfg.models.some(m=>m.id===id&&m.kind===kind)));cfg.id=previous?.id||'api:'+id();
    secrets.providerKeys??={};secrets.providerKeys[cfg.id]=apiKey;
    await writeFile(join(dataDir,'secrets.json'),JSON.stringify(secrets),{mode:0o600});
    await store.update(s=>{s.settings.providers??=[];const index=s.settings.providers.findIndex(p=>p.id===cfg.id);if(index<0)s.settings.providers.push(cfg);else s.settings.providers[index]=cfg;});
    return {...cfg,configured:!!apiKey||cfg.type==='custom'};
  }
  async function remove(providerId){
  if(providerId==='voicestudio'){
    await store.update(s=>{s.settings.voicestudioUrl='';if(s.settings.voiceProvider==='voicestudio')s.settings.voiceProvider='';});
    delete secrets.voicestudioKey;await writeFile(join(dataDir,'secrets.json'),JSON.stringify(secrets),{mode:0o600});return {ok:true};
  }

    if(!find(providerId))throw fail('Provider not found.');
    await store.update(s=>{s.settings.providers=s.settings.providers.filter(p=>p.id!==providerId);for(const [route,model] of [['chatProvider','model'],['voiceProvider','speechModel'],['transcriptionProvider','listeningModel'],['videoProvider','videoModel']])if(s.settings[route]===providerId){s.settings[route]='';}});
    delete secrets.providerKeys?.[providerId];await writeFile(join(dataDir,'secrets.json'),JSON.stringify(secrets),{mode:0o600});return {ok:true};
  }
  function selected(providerId,modelId,kind){const cfg=find(providerId);if(!cfg)throw fail('Choose a connected provider in Settings.');const model=cfg.models.find(m=>m.id===modelId&&m.kind===kind);if(!model)throw fail('Choose a model from this provider.');return {cfg,model,apiKey:key(cfg)};}
  async function use(body){if(body.id==='voicestudio'){voiceStudioConfig();if(body.kind!=='speech'||body.model!=='omnivoice')throw fail('Choose OmniVoice for VoiceStudio.');await store.update(s=>s.settings.voiceProvider='voicestudio');return {ok:true};}const {cfg,model}=selected(body.id,body.model,body.kind);const route={chat:'chatProvider',speech:'voiceProvider',transcription:'transcriptionProvider',video:'videoProvider'}[model.kind];await store.update(s=>{const p=s.settings.providers.find(p=>p.id===cfg.id);p.defaultModels??={};p.defaultModels[model.kind]=model.id;s.settings[route]=cfg.id;});return {ok:true};}
  function defaultModel(providerId,kind){const p=find(providerId);return p?.defaultModels?.[kind]||p?.models.find(m=>m.kind===kind)?.id||'';}

  async function chat(providerId,modelId,messages){
    const {cfg,apiKey}=selected(providerId,modelId,'chat'),anthropic=cfg.protocol==='anthropic';
    const body=anthropic?{model:modelId,max_tokens:4000,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:messages.filter(m=>m.role!=='system')}:{model:modelId,messages,...(cfg.type==='openai'?{max_completion_tokens:4000}:{max_tokens:4000})};
    const result=await (await request(cfg,apiKey,anthropic?'/messages':'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    const resultText=anthropic?result.content?.filter(p=>p.type==='text').map(p=>p.text).join(''):result.choices?.[0]?.message?.content;
    if(typeof resultText!=='string'||!resultText.trim())throw fail('The provider returned no usable text.');return {text:resultText,model:modelId};
  }
  function validateVoice(body){const {model}=selected(body.provider,body.engine,'speech');if(body.kind!=='voice'||body.voiceMode!=='preset'||!model.voices.includes(body.voice))throw fail('Choose a supported preset voice for this provider.');}
  async function claim(jobId){const j=store.read().jobs.find(j=>j.id===jobId);validateVoice(j);await store.update(s=>{const current=s.jobs.find(j=>j.id===jobId);if(current.status!=='prepared')throw fail('This take has already been submitted.');Object.assign(current,{status:'submitting',error:''});});}
  async function run(jobId){try{
    const j=store.read().jobs.find(j=>j.id===jobId),{cfg,apiKey}=selected(j.provider,j.engine,'speech');
    const eleven=cfg.protocol==='elevenlabs';
    const response=await request(cfg,apiKey,eleven?'/text-to-speech/'+encodeURIComponent(j.voice):'/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(eleven?{model_id:j.engine,text:j.text}:{model:j.engine,input:j.text,voice:j.voice,response_format:'mp3'})});
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>128*1024*1024)throw fail('Audio exceeds 128 MB.');chunks.push(chunk);}
    const audio=decodeAudio(Buffer.concat(chunks),response.headers.get('content-type')||'audio/mpeg');
    const asset={id:id(),name:j.sectionTitle+'.'+audio.ext,type:audio.type,size:audio.bytes.length,createdAt:now()};await writeFile(join(dataDir,'media',asset.id),audio.bytes,{mode:0o600});
    await store.update(s=>{s.assets.push(asset);Object.assign(s.jobs.find(j=>j.id===jobId),{status:'completed',outputId:asset.id,updatedAt:now()});});
  }catch(error){await store.update(s=>Object.assign(s.jobs.find(j=>j.id===jobId),{status:'failed',error:error.status?error.message:'Provider request interrupted. Check provider activity before trying again.',updatedAt:now()}));}}
  async function listen(providerId,modelId,assetId){const {cfg,apiKey}=selected(providerId,modelId,'transcription'),asset=store.read().assets.find(a=>a.id===assetId);if(!asset||!asset.type.startsWith('audio/'))throw fail('Choose an audio recording.');const form=new FormData();form.set('model',modelId);form.set('file',new Blob([await readFile(join(dataDir,'media',asset.id))],{type:asset.type}),asset.name||'audio.wav');const result=await (await request(cfg,apiKey,'/audio/transcriptions',{method:'POST',body:form})).json();if(typeof result.text!=='string')throw fail('The provider returned no transcript.');return {text:result.text,model:modelId};}
  return {discover,save,remove,use,defaultModel,chat,validateVoice,claim,run,listen,publicProviders:()=> (store.read().settings.providers||[]).map(p=>({...p,configured:!!secrets.providerKeys?.[p.id]||p.type==='custom'}))};
}
