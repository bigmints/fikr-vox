export const localTranscriptionModels=[{id:'whisper-base',name:'Whisper Base · Compact'},{id:'whisper-small',name:'Whisper Small · More accurate'}];

export function transcriptionProviders(settings){
 return [['local','On this Mac'],...(settings.openrouterConfigured?[['openrouter','OpenRouter']]:[]),...(settings.providers||[]).filter(p=>p.models?.some(m=>m.kind==='transcription')).map(p=>[p.id,p.name])];
}
export function transcriptionModels(settings,provider){
 if(provider==='local')return localTranscriptionModels;
 if(provider==='openrouter')return (settings.catalog?.models||[]).filter(m=>m.inputs?.includes('audio')&&m.outputs?.includes('text')&&m.endpoints?.includes('/api/v1/chat/completions'));
 return (settings.providers||[]).find(p=>p.id===provider)?.models.filter(m=>m.kind==='transcription')||[];
}
export function modelTranscription(profile,settings={}){
 if(profile?.transcription)return {...profile.transcription};
 const provider=settings.transcriptionProvider||'local';
 const model=provider==='local'?(settings.localTranscriptionModel||'whisper-base'):provider==='openrouter'?(settings.listeningModel||''):(settings.providers||[]).find(p=>p.id===provider)?.defaultModels?.transcription||'';
 return {provider,model:model||transcriptionModels(settings,provider)[0]?.id||''};
}
export function validateModelTranscription(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.provider!=='string'||!['local','openrouter'].includes(value.provider)&&!/^api:[\w-]+$/.test(value.provider)||typeof value.model!=='string'||!value.model.trim()||value.model.length>200)throw Error('Choose a transcription provider and model in My Models.');
 if(value.provider==='local'&&!localTranscriptionModels.some(m=>m.id===value.model))throw Error('Choose a Whisper transcription model.');
 return {provider:value.provider,model:value.model};
}
