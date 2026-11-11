const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function collectionMenu(collection,item,{rename=false}={}){
 if(!item)return '';
 const name=escape(item.title||item.name),id=`actions-${collection}-${escape(item.id)}`;
 return `<div class="collection-menu"><button type="button" class="collection-menu-trigger" popovertarget="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${name}" title="${collection==='projects'?'Project':'Model'} actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button><div id="${id}" class="collection-menu-popup" popover="auto" role="menu" aria-label="Actions for ${name}">${rename?'<button type="button" role="menuitem" data-rename>Rename</button>':''}${['duplicate','delete'].map(action=>`<button type="button" role="menuitem" data-collection="${collection}" data-item-id="${escape(item.id)}" data-collection-action="${action}">${action==='duplicate'?'Duplicate':'Delete'}${action==='delete'?'…':''}</button>`).join('')}</div></div>`;
}

export function bindCollectionMenus(host){
 host.querySelectorAll('.collection-menu').forEach(wrapper=>{
  const trigger=wrapper.querySelector('.collection-menu-trigger'),popup=wrapper.querySelector('[popover]');
  let focusLast=false;
  const items=()=>[...popup.querySelectorAll('button:not(:disabled)')];
  const place=()=>{const box=trigger.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(box.right-popup.offsetWidth,innerWidth-popup.offsetWidth-8))+'px';popup.style.top=(box.bottom+popup.offsetHeight+6>innerHeight?Math.max(8,box.top-popup.offsetHeight-6):box.bottom+6)+'px';};
  popup.ontoggle=()=>{const open=popup.matches(':popover-open');trigger.setAttribute('aria-expanded',String(open));if(open){place();(focusLast?items().at(-1):items()[0])?.focus();focusLast=false;}};
  trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();focusLast=event.key==='ArrowUp';popup.showPopover();}};
  popup.onkeydown=event=>{
   const buttons=items(),index=buttons.indexOf(document.activeElement);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
   if(event.key==='Escape'||event.key==='Tab'){popup.hidePopover();if(event.key==='Escape'){event.preventDefault();trigger.focus();}}
  };
  popup.onclick=event=>{if(event.target.closest('button'))popup.hidePopover();};
 });
}
