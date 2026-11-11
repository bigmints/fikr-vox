import {readFileSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const resources=join(dirname(fileURLToPath(import.meta.url)),'../local-tts');
export const languageCatalog=JSON.parse(readFileSync(join(resources,'language-catalog.json'),'utf8'));
const fail=message=>Object.assign(Error(message),{status:400});
export function validateLanguageSettings(b){
 for(const [key,allowed] of [['transcriptionProvider',['local','openrouter']],['translationProvider',['local','apple']]])if(b[key]!==undefined&&!allowed.includes(b[key])&&!(key==='transcriptionProvider'&&typeof b[key]==='string'&&b[key].startsWith('api:')))throw fail('Choose a supported '+key+'.');
 if(b.localTranscriptionModel!==undefined&&languageCatalog[b.localTranscriptionModel]?.task!=='transcribe')throw fail('Choose a local transcription model.');
}
export function validateTranslation(b){
 if(!['local','apple'].includes(b.provider))throw fail('Choose a local translation provider.');
 if(typeof b.text!=='string'||!b.text.trim()||b.text.length>12000)throw fail('Use 1–12,000 characters for translation.');
 if(typeof b.source!=='string'||typeof b.target!=='string'||b.source===b.target)throw fail('Choose different source and target languages.');
 if(b.provider==='local'&&(!languageCatalog.m2m100.languages[b.source]||!languageCatalog.m2m100.languages[b.target]))throw fail('The compact translator does not support this language pair.');
}
export function runAppleLanguage(request){
 return new Promise((resolve,reject)=>{
  const binary=join(resources,'apple-language');if(!existsSync(binary)){resolve({available:false,languages:[],reason:'Apple Foundation Models is available in the Mac app on macOS 26 or later.'});return;}
  const child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});let out='',error='';const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
  child.stdout.on('data',v=>out=(out+v).slice(-256000));child.stderr.on('data',v=>error=(error+v).slice(-1000));child.on('error',e=>{clearTimeout(timer);reject(fail(e.message));});child.on('close',code=>{clearTimeout(timer);try{const value=JSON.parse(out);if(code||value.error)throw Error(value.error||'Apple Foundation Models stopped.');resolve(value);}catch(e){reject(fail(e.message||error));}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));
 });
}
export function createLocalLanguage(store,dataDir,localTts,apple=runAppleLanguage){
 const root=join(dataDir,'local-tts');let setup={busy:false,error:''};
 async function status(){
  const models={};for(const [id,spec] of Object.entries(languageCatalog)){let ready=false;try{const marker=JSON.parse(await readFile(join(root,'language-'+id+'.ready.json'),'utf8'));ready=marker.revision===spec.revision&&(marker.runtimeVersion||1)===(spec.runtimeVersion||1)&&(marker.processorRevision||null)===(spec.processorRevision||null)&&existsSync(join(root,'venv/bin/python'));}catch{}models[id]={...spec,ready};}
  let foundation;try{foundation=await apple({operation:'status'});}catch(e){foundation={available:false,languages:[],reason:e.message};}
  return {...setup,supported:process.platform==='darwin'&&process.arch==='arm64',models,apple:foundation};
 }
 async function ensureReady(model){if(!(await status()).models[model]?.ready)throw fail('Download this local model in Settings first.');}
 return {status,
  async download(model){if(!languageCatalog[model])throw fail('Choose a local language model.');if(setup.busy)throw fail('A local language model is already downloading.');if(process.platform!=='darwin'||process.arch!=='arm64')throw fail('Local MLX transcription requires an Apple Silicon Mac.');setup={busy:true,model,error:''};void localTts.runAux('download',{model}).catch(e=>setup.error=e.message).finally(()=>setup.busy=false);return {ok:true};},
  async listen(b){const model=b.model||store.read().settings.localTranscriptionModel||'whisper-base';if(languageCatalog[model]?.task!=='transcribe')throw fail('Choose a local transcription model.');const language=b.language||'auto';if(language!=='auto'&&!languageCatalog[model].languages[language])throw fail('Choose a language supported by this transcription model.');if(b.task&&!['transcribe','translate'].includes(b.task))throw fail('Choose transcription or translation to English.');const asset=store.read().assets.find(a=>a.id===b.assetId);if(!asset||!asset.type?.startsWith('audio/'))throw fail('Choose an audio recording.');await ensureReady(model);return localTts.runAux('transcribe',{model,language,task:b.task||'transcribe',input:join(dataDir,'media',asset.fileName||asset.id)});},
  async translate(b){b={...b,provider:b.provider||store.read().settings.translationProvider||'local'};validateTranslation(b);if(b.provider==='apple'){const info=(await status()).apple;if(!info.available)throw fail(info.reason);const supported=code=>info.languages.some(v=>v.split('-')[0]===code);if(!supported(b.source)||!supported(b.target))throw fail('Apple Foundation Models does not support this language pair. Choose the compact multilingual translator.');return apple({...b,operation:'translate'});}await ensureReady('m2m100');return localTts.runAux('translate',{...b,model:'m2m100'});}
 };
}
