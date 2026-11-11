import {id,now} from './store.mjs';

const busy = job => ['submitting','queued','running','cancel_requested','waiting'].includes(job.status);
const fail = (message,status=409) => { throw Object.assign(new Error(message),{status}); };
function remap(value,ids) {
  if(typeof value==='string')return ids.get(value)||value;
  if(Array.isArray(value))return value.map(v=>remap(v,ids));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[ids.get(k)||k,remap(v,ids)]));
  return value;
}
export function collectionAction(state,collection,itemId,operation) {
  const item=state[collection].find(x=>x.id===itemId);
  if(!item)fail(collection==='projects'?'Project not found.':'Model not found.',404);
  if(operation==='duplicate') {
    const copy=structuredClone(item),stamp=now();
    if(collection==='projects') {
      const jobs=state.jobs.filter(j=>j.projectId===itemId&&j.status==='completed'&&j.outputId);
      const ids=new Map([[itemId,id()],...item.sections.map(s=>[s.id,id()]),...jobs.map(j=>[j.id,id()])]);
      for(const job of jobs)if(job.sectionId&&!ids.has(job.sectionId))ids.set(job.sectionId,id());
      const result=remap(copy,ids);
      result.title=(item.title||'Untitled project')+' · copy';
      result.createdAt=stamp;result.updatedAt=stamp;
      for(let i=0;i<result.sections.length;i++)for(const key of ['pendingVoiceTakeId','pendingVideoTakeId'])if(!ids.has(item.sections[i][key]))delete result.sections[i][key];
      const copies=jobs.map(job=>({...remap(job,ids),projectTitle:result.title,copiedFromJobId:job.copiedFromJobId||job.id}));
      state.jobs.push(...copies);state.projects.unshift(result);return result;
    }
    copy.id=id();copy.name=item.name+' · copy';copy.createdAt=stamp;copy.updatedAt=stamp;
    state.profiles.push(copy);return copy;
  }
  if(collection==='projects') {
    if(state.jobs.some(j=>j.projectId===itemId&&busy(j)))fail('Wait for this project’s queued or running jobs to finish, or cancel them before deleting.');
    // Keep completed/failed job records for spending history and all shared media.
    state.jobs=state.jobs.filter(j=>j.projectId!==itemId||j.status!=='prepared');
  } else {
    const used=state.projects.find(p=>p.profileId===itemId||p.podcast?.speakers?.some(s=>s.profileId===itemId)||p.tracks?.some(t=>t.profileId===itemId));
    if(used)fail(`This model is used by “${used.title}”. Choose another model in that project before deleting.`);
    if(state.jobs.some(j=>j.profileId===itemId&&busy(j)))fail('Wait for this model’s queued or running jobs to finish before deleting.');
    state.jobs=state.jobs.filter(j=>j.profileId!==itemId||j.status!=='prepared');
  }
  state[collection]=state[collection].filter(x=>x.id!==itemId);
  return {deleted:true};
}
