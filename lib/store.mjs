import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const initialState = () => ({version:1, projects:[], profiles:[], assets:[], jobs:[], settings:{workerUrl:'',model:'',workerStatus:'disconnected'}});
function normalizeWorkerProvider(record, key) {
  const value = record?.[key];
  // The first studio schema reserved unnamed provider IDs for remote workers.
  if (typeof value === 'string' && value && !['local', 'openrouter', 'voicestudio', 'worker'].includes(value) && !value.startsWith('api:')) {
    record[key] = 'worker';
  }
}
export async function createStore(dir) {
  await mkdir(dir,{recursive:true});
  const path=join(dir,'studio.json');
  let state;
  try { state=JSON.parse(await readFile(path,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; state=initialState(); }
  normalizeWorkerProvider(state.settings, 'voiceProvider');
  for (const profile of state.profiles ?? []) normalizeWorkerProvider(profile, 'voiceProvider');
  for (const job of state.jobs ?? []) {
    if (job.kind === 'voice' || job.kind === 'avatar') normalizeWorkerProvider(job, 'provider');
  }
  let chain=Promise.resolve();
  return {
    read:()=>structuredClone(state),
    update(fn) {
      const task=chain.then(async()=>{
        const next=structuredClone(state); const result=await fn(next);
        await writeFile(path+'.tmp',JSON.stringify(next,null,2),{mode:0o600});
        await rename(path+'.tmp',path); state=next; return result;
      });
      chain=task.catch(()=>{}); return task;
    }
  };
}
