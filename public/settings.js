import {mountLanguageSettings} from './local-language-settings.js';
import {mountProviderManager} from './provider-manager.js';
import {mountSettingsAbout} from './settings-about.js';
let activeConnectionTab = 'chat';
let activeSettingsPage = 'connections';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  connections:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  chat:'M4 4h16v12H9l-5 4z',
  audio:'M4 10v4 M8 6v12 M12 3v18 M16 7v10 M20 10v4',
  transcription:'M9 3h6v10H9z M6 10v3a6 6 0 0 0 12 0v-3 M12 19v3 M8 22h8',
  translation:'M3 5h12 M9 3v2 M5 5c1 5 4 8 9 10 M13 5c-1 5-4 8-9 10 M14 21l4-10 4 10 M16 17h4',
  about:'M12 10v7m0-10v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  video:'M3 5h13v14H3z M16 10l6-4v12l-6-4',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
const services = {
  openrouter:{name:'OpenRouter',key:'openrouterKey',configured:'openrouterConfigured',help:'Paste your OpenRouter API key. The same key connects Chat, Audio, Transcription, and Video.',note:'Cloud generation uses your OpenRouter credits.'},
};
const localModels = {
  'omnivoice-design':['OmniVoice · Create a voice','Describe a voice, compare previews, and save a reusable voice. No recording needed. Shares the OmniVoice download.'],
  'omnivoice-presets':['OmniVoice · Ready-made voices','Four built-in voices, including Malayalam. No recording needed. Shares the OmniVoice download.'],
  omnivoice:['OmniVoice · Multilingual clone','Local voice cloning in Malayalam, Tamil, Telugu and more languages.'],
  kokoro:['Kokoro','54 preset voices for multilingual speech.'],
  'qwen3':['Qwen3 · Fast clone','Clone your voice with a short reference recording.'],
  'qwen3-hq':['Qwen3 · Quality clone','Higher-quality voice cloning with a larger model.'],
  'qwen3-custom':['Qwen3 · CustomVoice','Preset voices with control over delivery and expression.'],
  'qwen3-design':['Qwen3 · VoiceDesign','Create a voice by describing how it should sound.'],
};
const row = (title, description, control, attributes = '') => `<div class="setting-row" ${attributes}><div class="setting-copy"><div class="setting-label">${title}</div><p>${description}</p></div><div class="setting-control">${control}</div></div>`;
export function mountSettings(host, {settings, getSettings = () => settings, modelPicker, initModelPickers, closeModelPicker, renderLocalSettings, api, refresh, loadModels, connection, openExternal, updates}) {
  const q = selector => host.querySelector(selector), checks = {};let managedProviders;
  const configured = service => !!getSettings()[services[service].configured] && (!services[service].url || !!getSettings()[services[service].url]);
  const providerEntry=(service,description)=>`<div class="provider-entry" data-provider-row="${service}"><div class="provider-mark" aria-hidden="true">OR</div><div class="provider-entry-copy"><h3>${services[service].name}</h3><p>${description}</p></div><div class="provider-entry-actions"><span class="settings-status" data-service-summary="${service}" role="status"></span><button type="button" data-connect="${service}"></button></div></div>`;
  host.innerHTML=`<div class="settings-layout connections-layout">
    <aside class="settings-sidebar" aria-label="Settings navigation"><nav class="settings-nav" aria-label="Settings"><div class="settings-nav-group" role="group" aria-labelledby="settings-connections-label"><h2 id="settings-connections-label" class="settings-nav-group-title">Connections</h2>${['chat','audio','transcription','translation','video'].map(id=>`<button type="button" data-connection-page="${id}" aria-controls="connections-${id}">${icon(id)}<span>${id[0].toUpperCase()+id.slice(1)}</span></button>`).join('')}</div><button type="button" data-settings-page="about">${icon('about')}<span>About</span></button></nav></aside>
    <div class="settings-workspace"><div class="settings-main"><div data-settings-content="connections">
      <div class="settings-page-heading provider-page-heading"><div><h2 id="settings-heading" tabindex="-1"></h2><p id="settings-description"></p></div><button type="button" class="primary" data-add-provider><span aria-hidden="true">＋</span> Add provider</button></div>
      <div class="simple-connections">
        <section id="connections-chat" data-connection-group="chat" role="region" aria-label="Chat connections"><div data-added-providers="chat"></div><div class="provider-card">${providerEntry('openrouter','Write and edit with cloud models.')}</div></section>
        <section id="connections-audio" data-connection-group="audio" role="region" aria-label="Audio connections"><div data-added-providers="speech"></div>
          <div class="provider-card">${providerEntry('openrouter','Generate speech with cloud voices.')}</div>
          <section class="local-downloads-section" aria-labelledby="local-downloads-heading"><div class="local-downloads-heading"><h3 id="local-downloads-heading">On this Mac</h3><p>Download models for offline audio.</p></div><div class="provider-card local-downloads-list"><div id="local-tts-settings"><p class="settings-local-note" role="status">Checking local models…</p></div></div></section>
        </section>
        <section id="connections-transcription" data-connection-group="transcription" role="region" aria-label="Transcription connections"><div data-added-providers="transcription"></div><div class="provider-card">${providerEntry('openrouter','Transcribe recordings with a cloud model.')}</div><section class="provider-card language-settings" id="local-transcription-settings"></section></section>
        <section id="connections-translation" data-connection-group="translation" role="region" aria-label="Translation connections"><section class="provider-card language-settings" id="local-translation-settings"></section></section>
        <section id="connections-video" data-connection-group="video" role="region" aria-label="Video connections"><div data-added-providers="video"></div><div class="provider-card">${providerEntry('openrouter','Generate videos with cloud models.')}</div></section>
        <div class="connections-footer"><p id="models-save-status" role="status" aria-live="polite"></p><div data-route-catalog><span id="catalog-status" class="settings-status" role="status"></span><button type="button" id="refresh-models">Refresh models</button></div></div>
      </div><div id="connection-editor-home" hidden></div>
    </div><div data-settings-content="about" hidden></div></div></div></div>`;
  q('#connection-editor-home').innerHTML=Object.entries(services).map(([service,spec])=>`<form class="connection-editor" data-service="${service}" id="connect-${service}" hidden>
    <div class="connection-editor-intro"><p>${spec.help}</p><button type="button" data-close-editor aria-label="Close ${spec.name} setup">×</button></div>
    ${service==='openrouter'?'<p class="provider-key-help">Need an account or key? <button type="button" data-provider-link="https://openrouter.ai/settings/keys">Get one at OpenRouter ↗</button></p>':''}
    ${spec.url?`<label for="settings-${spec.url}">${spec.urlLabel}<input id="settings-${spec.url}" name="${spec.url}" type="url" required value="${escape(settings[spec.url])}" placeholder="${spec.placeholder}" spellcheck="false" maxlength="2000"></label>`:''}
    <label for="settings-${spec.key}">API key<input id="settings-${spec.key}" name="${spec.key}" type="password" autocomplete="new-password" placeholder="${configured(service)?'Key saved · enter a new key to replace':'Paste your API key'}"></label>
    <div class="connection-editor-actions"><span class="settings-status" data-editor-status role="status"></span><div class="settings-buttons"><button type="button" class="settings-text-button" data-remove-key ${configured(service)?'':'hidden'}>${spec.url?'Disconnect':'Remove key'}</button><button type="submit" class="primary"></button></div></div><p class="settings-footnote">${spec.note}</p>
  </form>`).join('');
  const forms=Object.fromEntries(Object.keys(services).map(service=>[service,q(`[data-service="${service}"]`)]));
  const refreshRouteAvailability=()=>{q('[data-route-catalog]').hidden=activeConnectionTab==='translation'||!configured('openrouter');};
  const updateSummaries=()=>{
    for(const service of Object.keys(services)){
      const saved=configured(service),connected=checks[service]===true;
      const label=checks[service]===false?'Check connection':connected?'Connected':saved?'Key saved':'Not connected';
      host.querySelectorAll(`[data-service-summary="${service}"]`).forEach(el=>{el.textContent=label;el.dataset.state=checks[service]===false?'error':connected?'success':'';});
      host.querySelectorAll(`[data-connect="${service}"]`).forEach(button=>{button.textContent=saved?'Manage':'Connect';button.setAttribute('aria-label',`${saved?'Manage':'Connect'} ${services[service].name}`);button.setAttribute('aria-expanded',String(!forms[service].hidden&&forms[service].previousElementSibling===button.closest('[data-provider-row]')));button.setAttribute('aria-controls',`connect-${service}`);});
      forms[service].querySelector('[data-remove-key]').hidden=!saved;
      const input=forms[service].elements[services[service].key];input.required=!getSettings()[services[service].configured];
      const address=services[service].url,changed=!!input.value.trim()||(address&&forms[service].elements[address].value.trim()!==(getSettings()[address]||''));
      forms[service].querySelector('[type="submit"]').textContent=!saved?'Save & connect':changed?'Save & test':'Test connection';
    }
    refreshRouteAvailability();managedProviders?.render();
  };
  const closeEditor=form=>{form.hidden=true;q('#connection-editor-home').append(form);updateSummaries();};
  const openEditor=(service,anchor)=>{const form=forms[service];if(!form)return;const row=anchor||[...host.querySelectorAll(`[data-provider-row="${service}"]`)].find(el=>el.getClientRects().length);if(!row)return;Object.values(forms).forEach(closeEditor);row.after(form);form.hidden=false;updateSummaries();form.scrollIntoView({block:'nearest',behavior:'smooth'});form.querySelector('input').focus({preventScroll:true});};
  for(const button of host.querySelectorAll('[data-connect]'))button.onclick=()=>{const form=forms[button.dataset.connect];if(form.hidden)openEditor(button.dataset.connect,button.closest('[data-provider-row]'));else closeEditor(form);};
  host.querySelectorAll('[data-provider-link]').forEach(button=>button.onclick=async()=>{try{await openExternal(button.dataset.providerLink);}catch(error){const status=button.closest('form')?.querySelector('[data-editor-status]')||q('#models-save-status');status.textContent=error.message||String(error);}});
  let videoCatalogLoaded=false;
  const updateCatalogCount=()=>{q('#catalog-status').textContent='';};
  const refreshCatalog=async()=>{const button=q('#refresh-models');button.disabled=true;button.textContent='Refreshing…';try{if(activeConnectionTab==='video'){const models=await api('/openrouter/video-models');getSettings().videoModels=models;videoCatalogLoaded=true;initModelPickers();}else await loadModels();updateCatalogCount();}catch(error){q('#catalog-status').textContent=error.message||String(error);}finally{button.disabled=false;button.textContent='Refresh models';}};
  q('#refresh-models').onclick=refreshCatalog;
  const connectionPages=[...host.querySelectorAll('[data-connection-page]')];
  const updateNavigation=()=>{
    host.querySelectorAll('[data-settings-page],[data-connection-page]').forEach(button=>{
      const selected=button.dataset.connectionPage?activeSettingsPage==='connections'&&button.dataset.connectionPage===activeConnectionTab:button.dataset.settingsPage===activeSettingsPage;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  };
  const selectConnectionPage=button=>{
    closeModelPicker();Object.values(forms).forEach(closeEditor);activeConnectionTab=button.dataset.connectionPage;q('[data-add-provider]').dataset.connectionKind=activeConnectionTab;
    host.querySelectorAll('[data-connection-group]').forEach(group=>group.hidden=group.dataset.connectionGroup!==activeConnectionTab);
    const copy={chat:['Chat','Connect a service for writing and editing.'],audio:['Audio','Connect a voice service or use models on this Mac.'],transcription:['Transcription','Turn recordings into text with local or cloud models.'],translation:['Translation','Translate scripts on this Mac, including Malayalam.'],video:['Video','Connect a service for video generation.']}[activeConnectionTab];
    q('#settings-heading').textContent=copy[0];q('#settings-description').textContent=copy[1];q('.settings-main').scrollTop=0;updateNavigation();updateCatalogCount();refreshRouteAvailability();q('#local-'+activeConnectionTab+'-settings')?.dispatchEvent(new Event('language-refresh'));
    if(activeConnectionTab==='video'&&configured('openrouter')&&!getSettings().videoModels?.length&&!videoCatalogLoaded)void refreshCatalog();
  };
  connectionPages.forEach(button=>button.onclick=()=>{selectConnectionPage(button);selectSettingsPage('connections');});
  for(const [service,form] of Object.entries(forms)){
    const spec=services[service],keyInput=form.elements[spec.key],output=form.querySelector('[data-editor-status]');form.oninput=updateSummaries;
    form.querySelector('[data-close-editor]').onclick=()=>{const button=form.previousElementSibling?.querySelector('[data-connect]');closeEditor(form);button?.focus();};
    const run=async operation=>{if(form.dataset.busy)return;form.dataset.busy='true';const controls=[...form.querySelectorAll('input,button')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);output.dataset.state='busy';try{await operation();output.dataset.state='success';}catch(error){output.dataset.state='error';output.textContent=error.message||String(error);}finally{delete form.dataset.busy;controls.forEach((el,i)=>el.disabled=disabled[i]);updateSummaries();}};
    form.onsubmit=event=>{event.preventDefault();run(async()=>{output.textContent='Connecting…';const changes={};if(keyInput.value.trim())changes[spec.key]=keyInput.value.trim();if(spec.url)changes[spec.url]=form.elements[spec.url].value.trim();if(Object.keys(changes).length){await api('/settings','PUT',changes);keyInput.value='';keyInput.placeholder='Key saved · enter a new key to replace';await refresh();if(spec.url)form.elements[spec.url].value=getSettings()[spec.url]||'';}
      try{await api(`/${service}/check`,'POST');checks[service]=true;await refresh();connection();}catch(error){checks[service]=false;throw new Error(`${configured(service)?'Saved, but could not connect. ':''}${error.message||String(error)}`);}
      output.textContent='Connected.';if(service==='openrouter')await refreshCatalog();const card=form.closest('.provider-card');closeEditor(form);card?.querySelector('.model-trigger')?.focus({preventScroll:true});
    });};
    form.querySelector('[data-remove-key]').onclick=()=>run(async()=>{output.textContent='Disconnecting…';await api('/settings','PUT',{[spec.key]:'',...(spec.url?{[spec.url]:''}:{})});await refresh();delete checks[service];keyInput.value='';if(spec.url)form.elements[spec.url].value='';keyInput.placeholder='Paste your API key';connection();output.textContent=configured(service)?'A key is still supplied by your app environment.':'Disconnected.';});
  }
  let aboutMounted=false;
  const selectSettingsPage=page=>{activeSettingsPage=page;closeModelPicker();host.querySelectorAll('[data-settings-content]').forEach(el=>el.hidden=el.dataset.settingsContent!==page);updateNavigation();q('.settings-main').scrollTop=0;if(page==='about'){Object.values(forms).forEach(closeEditor);if(!aboutMounted){aboutMounted=true;void mountSettingsAbout(q('[data-settings-content="about"]'),{openExternal,api,updates});}}};
  host.querySelectorAll('[data-settings-page]').forEach(button=>button.onclick=()=>selectSettingsPage(button.dataset.settingsPage));
  for(const kind of ['transcription','translation'])void mountLanguageSettings(q('#local-'+kind+'-settings'),{api,getSettings,refresh,kind});
  managedProviders=mountProviderManager(host,{api,getSettings,refresh,openExternal,onUpdate:()=>{updateSummaries();renderLocalSettings();q('#local-transcription-settings')?.dispatchEvent(new Event('language-refresh'));},onSaved:page=>{selectConnectionPage(q(`[data-connection-page="${page}"]`));selectSettingsPage('connections');}});
  updateSummaries();initModelPickers();selectConnectionPage(q(`[data-connection-page="${activeConnectionTab}"]`));renderLocalSettings();selectSettingsPage(activeSettingsPage);
}
const omniVoiceOptions = [
  ['omnivoice-design','Create a voice','Describe the voice you want to create.'],
  ['omnivoice-presets','Ready-made voices','Choose a built-in voice, including Malayalam.'],
  ['omnivoice','Voice cloning','Use a recording to recreate a voice.'],
];

export function localModelDownloadEntries(status) {
  const models=status.models||{},order=Object.keys(localModels),entries=[];
  let addedOmniVoice=false;
  for(const [key,model] of Object.entries(models).sort(([a],[b])=>order.indexOf(a)-order.indexOf(b))){
    if(omniVoiceOptions.some(([id])=>id===key)){
      if(addedOmniVoice)continue;
      addedOmniVoice=true;
      const options=omniVoiceOptions.filter(([id])=>models[id]);
      entries.push({key:'omnivoice',model:{...(models.omnivoice||model),name:'OmniVoice',ready:options.some(([id])=>models[id].ready)},options,busy:!!status.busy&&omniVoiceOptions.some(([id])=>id===status.engine)});
    }else entries.push({key,model,busy:!!status.busy&&status.engine===key});
  }
  return entries;
}

export function renderLocalModelSettings(host, status, {download,refresh}) {
  const downloadButton=(key,name,busy)=>`<button type="button" data-local-download="${escape(key)}" ${status.busy||!status.supported?'disabled':''} aria-label="Download ${escape(name)}">${busy?'Downloading…':'Download'}</button>`;
  host.innerHTML=localModelDownloadEntries(status).map(({key,model,options,busy})=>{
    const label=busy?'Downloading…':!status.supported?'Apple Silicon required':model.ready?'Downloaded':'Not downloaded';
    const state=`<span class="settings-status ${model.ready?'is-ready':''}">${label}</span>`;
    const [name,description]=options?['OmniVoice','Voice design, presets, and cloning in one download.']:(localModels[key]||[model.name,'Local voice generation.']);
    return row(escape(name),escape(description),state+(!model.ready?downloadButton(key,name,busy):''),'data-local-download-entry');
  }).join('')+`<div class="local-download-footer"><p role="status" class="settings-status" data-local-status>${status.busy?'Setup is in progress. Keep Fikr Vox open.':status.error?escape(status.error):!status.supported?'Local models require a Mac with an Apple Silicon chip.':'The first download also installs the speech runtime. Allow several minutes and several GB of storage.'}</p><button type="button" class="settings-inline-action" data-local-refresh>Refresh status</button></div>`;
  const output=host.querySelector('[data-local-status]');
  if(status.error)output.dataset.state='error';
  host.querySelectorAll('[data-local-download]').forEach(button=>button.onclick=async()=>{
    const controls=[...host.querySelectorAll('[data-local-download]')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);output.textContent='Starting download…';
    try{await download(button.dataset.localDownload);await refresh();}catch(error){output.textContent=error.message||String(error);output.dataset.state='error';controls.forEach((el,i)=>el.disabled=disabled[i]||!!status.busy);}
  });
  host.querySelector('[data-local-refresh]').onclick=async()=>{try{await refresh();}catch(error){output.textContent=error.message;output.dataset.state='error';}};
}
