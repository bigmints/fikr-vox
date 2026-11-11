export const twinLanguages = [['en','English'],['ml','Malayalam'],['ar','Arabic'],['hi','Hindi'],['es','Spanish'],['fr','French'],['zh','Chinese'],['ja','Japanese'],['ko','Korean'],['de','German'],['ru','Russian'],['pt','Portuguese'],['it','Italian'],["ta", "Tamil"],["te", "Telugu"],["kn", "Kannada"],["bn", "Bengali"],["mr", "Marathi"],["gu", "Gujarati"],["ur", "Urdu"],["as", "Assamese"],["or", "Odia"],["ne", "Nepali"],["si", "Sinhala"],["tr", "Turkish"],["id", "Indonesian"],["vi", "Vietnamese"],["th", "Thai"],["nl", "Dutch"],["pl", "Polish"],["sv", "Swedish"],["uk", "Ukrainian"]];
// Missing metadata is unknown support, rather than an invented restriction.
export function supportsVoiceLanguage(model,language){
 const languages=model?.languages;
 if(!languages)return true;
 return Array.isArray(languages)?languages.includes(language):Object.hasOwn(languages,language);
}
export function cloudVoiceChoices(model,language){
 if(!supportsVoiceLanguage(model,language))return [];
 return (model?.voices||[]).filter(v=>typeof v==='string'&&(!model.voiceLanguages?.[v]||(Array.isArray(model.voiceLanguages[v])?model.voiceLanguages[v].includes(language):model.voiceLanguages[v]===language)));
}
export function twinVoiceModels(provider,state,language){
 if(provider?.startsWith('api:'))return apiProviderModels(state.settings,provider).filter(m=>m.kind==='speech'&&(!language||supportsVoiceLanguage(m,language)));
 const compatible=m=>!language||supportsVoiceLanguage(m,language);
 if(provider==='openrouter')return (state.settings.catalog?.models||[]).filter(m=>m.outputs?.includes('speech')&&m.endpoints?.includes('/api/v1/audio/speech')&&compatible(m));
 if(provider==='voicestudio')return [{id:'omnivoice',name:'OmniVoice',cloning:true}];
 if(provider==='worker')return (state.settings.capabilities?.engines||[]).filter(m=>m.kind==='voice'&&m.ready&&compatible(m)).map(m=>({...m,name:m.name||m.id,cloning:true}));
 return [];
}
export function twinCloudVoiceSettings(value){
 const out={};for(const key of ['speechModel','voiceEngine','voiceMode','voice']){if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>200))throw Error('Use a valid voice '+key+'.');out[key]=value[key]||'';}
 if(value.voiceLanguage!==undefined&&(typeof value.voiceLanguage!=='string'||!twinLanguages.some(([id])=>id===value.voiceLanguage)))throw Error('Choose a supported voice language.');
 out.voiceLanguage=value.voiceLanguage||value.localVoiceLanguage||'en';
 if(out.voiceMode&&!['preset','clone'].includes(out.voiceMode))throw Error('Choose a preset voice or a recording.');
 return out;
}

export function apiProviderModels(settings,provider){
 return (settings.providers||[]).find(p=>p.id===provider)?.models.map(m=>({...m,inputs:[m.kind==='transcription'?'audio':'text'],outputs:[m.kind==='speech'?'speech':'text'],endpoints:[m.kind==='speech'?'/api/v1/audio/speech':'/api/v1/chat/completions']}))||[];
}
export function apiSpeechSettings(settings,profile={}){
 const provider=profile.voiceProvider||settings.voiceProvider;
 if(!provider?.startsWith('api:'))return null;
 const account=(settings.providers||[]).find(p=>p.id===provider),models=account?.models.filter(m=>m.kind==='speech')||[];
 const model=models.find(m=>m.id===profile.speechModel)||models.find(m=>m.id===account?.defaultModels?.speech)||models[0];
 return {voiceProvider:provider,speechModel:model?.id||'',voiceMode:'preset',voice:model?.voices?.includes(profile.voice)?profile.voice:'',account,model};
}
