const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountLanguageSettings(host,{api,kind='transcription'}){
 let status,loading=false;
 const transcribing=kind==='transcription';
 async function load(){if(loading||!host.isConnected)return;loading=true;try{status=await api('/local-language/status');if(!host.isConnected)return;render();if(status.busy)setTimeout(load,2000);}catch(e){if(host.isConnected)host.textContent=e.message;}finally{loading=false;}}
 function render(){
  const models=Object.entries(status.models).filter(([,model])=>model.task===(transcribing?'transcribe':'translate'));
  if(!transcribing){renderTranslation(models);bindDownloads();return;}
  host.innerHTML=`<h3>Local transcription</h3><div>${models.map(([id,m])=>`<div class="language-download"><div><strong>${escape(m.name)}</strong><small>${escape(m.size)}</small></div>${m.ready?'<span class="settings-status">Ready</span>':`<button type="button" data-language-download="${id}" ${status.busy||!status.supported?'disabled':''}>${status.busy&&status.model===id?'Downloading…':'Download'}</button>`}</div>`).join('')}</div><p class="note" role="status" data-language-feedback>${escape(status.error||(!status.supported?'Local models require an Apple Silicon Mac.':''))}</p>`;
  bindDownloads();
 }
 function renderTranslation(models){
  const apple=status.apple;
  const choices=[...models.map(([id,model])=>({name:model.name,note:[model.size,model.languages?.ml?'Includes Malayalam':''].filter(Boolean).join(' · '),ready:model.ready,disabled:!status.supported,download:id})),{name:'Apple Foundation Models',note:apple.available?'Built in · '+(apple.languages?.some(code=>code.split('-')[0]==='ml')?'Includes Malayalam':'Does not support Malayalam'):apple.reason,ready:apple.available}];
  host.innerHTML=`<div class="translation-model-list"><h3>Translation providers</h3><ul>${choices.map(model=>`<li class="translation-model-row"><div class="translation-model-copy"><strong>${escape(model.name)}</strong><small>${escape(model.note)}</small></div><div class="translation-model-status">${model.ready?'<span>Ready</span>':model.download?`<button type="button" data-language-download="${escape(model.download)}" ${status.busy||model.disabled?'disabled':''}>${status.busy&&status.model===model.download?'Downloading…':'Download'}</button>`:'<span>Unavailable</span>'}</div></li>`).join('')}</ul></div><p class="note" role="status" data-language-feedback>${escape(status.error||'')}</p>`;
 }
 function bindDownloads(){
  for(const button of host.querySelectorAll('[data-language-download]'))button.onclick=async()=>{button.disabled=true;try{await api('/local-language/download','POST',{model:button.dataset.languageDownload});await load();}catch(e){host.querySelector('[data-language-feedback]').textContent=e.message;button.disabled=false;}};
 }
 host.addEventListener('language-refresh',load);
 await load();
}
