const ages = ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'];
const pitches = ['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch'];
const accents = ['american', 'british', 'australian', 'canadian', 'indian', 'chinese', 'korean', 'japanese', 'portuguese', 'russian'];
const title = value => value[0].toUpperCase() + value.slice(1);
export const voiceTraitFields = [
  {key:'gender',label:'Gender',choices:[['female','Female'],['male','Male']]},
  {key:'age',label:'Age',choices:ages.map(value=>[value,title(value)])},
  {key:'pitch',label:'Pitch',choices:pitches.map((value,index)=>[value,['Very low','Low','Medium','High','Very high'][index]])},
  {key:'accent',label:'Accent',choices:accents.map(value=>[value+' accent',title(value)])},
];

// Read descriptions already saved by the earlier voice designer. The original
// description remains unchanged until the user edits a form field.
export function voiceTraitsFromDescription(description='') {
  const text=String(description).toLowerCase().replace(/[–—]/g,'-');
  const first=choices=>choices.find(([,pattern])=>pattern.test(text))?.[0]||'';
  const gender=first([['female',/\b(female|woman|feminine)\b/],['male',/\b(male|man|masculine)\b/]]);
  const age=first([['child',/\b(child|children)\b/],['teenager',/\b(teenager|teenage|teen)\b/],['young adult',/\b(young adult|young|youthful)\b/],['middle-aged',/\b(middle[- ]aged|mature)\b/],['elderly',/\b(elderly|older|senior)\b/]]);
  const pitch=first([['very low pitch',/\b(very|extremely) (low|deep)\b/],['very high pitch',/\b(very|extremely) high\b/],['low pitch',/\b(low|lower|deep|deeper|bass)\b/],['high pitch',/\b(high|higher|bright|brightly)\b/],['moderate pitch',/\b(moderate|medium|mid)[- ]pitch\b/]]);
  const accent=accents.find(value=>new RegExp('\\b'+value+'\\b').test(text));
  return {gender,age,pitch,whisper:/\b(whisper|whispering|whispered)\b/.test(text),casual:/\b(casual|conversational)\b/.test(text),accent:accent?accent+' accent':''};
}

export function voiceTraitsInstruction(traits,language) {
  const values=voiceTraitFields.filter(field=>field.key!=='accent').flatMap(field=>field.choices.some(([id])=>id===traits[field.key])?[traits[field.key]]:[]);
  if(traits.whisper)values.push('whisper');else if(traits.casual)values.push('casual conversational tone');
  if(language==='en'&&voiceTraitFields.find(field=>field.key==='accent').choices.some(([id])=>id===traits.accent))values.push(traits.accent);
  return values.join(', ');
}

export function mountVoiceDesignForm(host,{value='',language='en',speech={},onChange}) {
  let description=value,controls={speed:1,sentencePause:0,volume:1,...speech};
  host.innerHTML=`<div class="voice-traits-grid" role="group" aria-label="Voice traits">${voiceTraitFields.map(field=>`<label data-voice-trait-field="${field.key}" for="voice-trait-${field.key}">${field.label}<select id="voice-trait-${field.key}" data-voice-trait="${field.key}"><option value="">Any</option>${field.choices.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>`).join('')}<label data-voice-trait-field="tone" for="voice-trait-tone">Tone<select id="voice-trait-tone" data-voice-trait="tone" aria-describedby="voice-tone-note"><option value="">Natural</option><option value="casual">Casual · experimental</option><option value="whisper">Whispered</option></select></label><label data-voice-trait-field="speed" for="voice-trait-speed">Speed<select id="voice-trait-speed" data-voice-trait="speed">${[[.75,"Slow"],[.9,"Relaxed"],[1,"Normal"],[1.1,"Brisk"],[1.2,"Faster"],[1.35,"Fast"],[1.5,"Very fast"]].map(([value,label])=>`<option value="${value}">${label} · ${value}×</option>`).join('')}</select></label></div><p class="note" id="voice-tone-note" data-tone-note hidden>Casual conversational is experimental guidance. OmniVoice may ignore it.</p><p class="note voice-traits-help">Any lets OmniVoice choose. Preview a few voices, then keep your favourite.</p>`;
  const input=key=>host.querySelector(`[data-voice-trait="${key}"]`);
  const read=()=>Object.fromEntries([...voiceTraitFields.map(({key})=>[key,input(key).value]),['whisper',input('tone').value==='whisper'],['casual',input('tone').value==='casual']]);
  function fill(next){const traits=voiceTraitsFromDescription(next);for(const {key} of voiceTraitFields)input(key).value=traits[key];input('tone').value=traits.whisper?'whisper':traits.casual?'casual':'';toneNote();}
  function toneNote(){host.querySelector('[data-tone-note]').hidden=input('tone').value!=='casual';}
  function setLanguage(next){language=next;host.querySelector('[data-voice-trait-field="accent"]').hidden=language!=='en';}
  function setSpeech(next){controls={speed:1,sentencePause:0,volume:1,...next};const speed=input('speed');if(![...speed.options].some(option=>Number(option.value)===controls.speed)){const option=document.createElement('option');option.value=String(controls.speed);option.textContent=controls.speed+'×';speed.append(option);}speed.value=String(controls.speed);}
  for(const control of host.querySelectorAll('[data-voice-trait]'))control.onchange=()=>{description=voiceTraitsInstruction(read(),language);toneNote();controls.speed=Number(input('speed').value);onChange(description,{...controls});};
  fill(value);setLanguage(language);setSpeech(controls);
  return {setValue(next){if(next===description)return;description=next;fill(next);},setLanguage,setSpeech,speech:()=>({...controls}),hasTraits:()=>!!voiceTraitsInstruction(read(),language)};
}
