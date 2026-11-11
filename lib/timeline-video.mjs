import {mkdtemp,writeFile,copyFile,rm,stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {id,now} from './store.mjs';
const exec=promisify(execFile);
export function validateVideoPlan(b){
 if(!Number.isFinite(b.duration)||b.duration<=0||b.duration>7200)throw Error('Export a timeline up to two hours.');
 if(!['16:9','9:16','1:1','4:3'].includes(b.ratio)||!['contain','cover'].includes(b.fit))throw Error('Choose a valid video size and Fit/Fill setting.');
 if(!Array.isArray(b.clips)||!b.clips.length||b.clips.length>200)throw Error('Choose finished video clips to export.');
 let end=0;
 for(const c of b.clips){if(typeof c.assetId!=='string'||![c.start,c.duration,c.sourceStart].every(Number.isFinite)||c.start<end-0.00001||c.sourceStart<0||c.duration<=0||c.start+c.duration>b.duration+0.00001)throw Error('Invalid video clip timing.');end=c.start+c.duration;}
}
export async function exportTimelineVideo(store,dir,body){
 validateVideoPlan(body);
 if(process.platform!=='darwin')throw Error('Timeline video export currently requires macOS.');
 const work=await mkdtemp(join(dir,'timeline-export-'));
 try{
  const local=async(aid,kind,name)=>{const a=store.read().assets.find(a=>a.id===aid&&a.type.startsWith(kind+'/'));if(!a)throw Error('An export source is missing.');const file=a.fileName||a.id;if(basename(file)!==file||file.includes('\\'))throw Error('Invalid media path.');const ext=kind==='audio'?'.wav':a.type==='video/quicktime'?'.mov':a.type==='video/webm'?'.webm':'.mp4';const path=join(work,name+ext);await copyFile(join(dir,'media',file),path);return path;};
  const audio=await local(body.audioId,'audio','mix'),clips=[];
  for(let i=0;i<body.clips.length;i++)clips.push({...body.clips[i],path:await local(body.clips[i].assetId,'video','clip-'+i)});
  const output=join(work,'export.mp4'),request=join(work,'request.json');
  await writeFile(request,JSON.stringify({...body,audio,clips,output}),{mode:0o600});
  try{await exec('/usr/bin/swift',[new URL('./timeline-video.swift',import.meta.url).pathname,request],{timeout:1800000,maxBuffer:1024*1024});}catch(e){throw Error(e.killed?'Video export timed out. Try a shorter timeline.':e.stderr?.trim().split('\n').at(-1)||'Video export failed.');}
  const size=(await stat(output)).size;if(!size||size>512*1024*1024)throw Error('Video exceeds 512 MB. Export a shorter timeline.');
  const aid=id(),asset={id:aid,fileName:aid+'.mp4',name:basename(body.name||'Timeline.mp4'),type:'video/mp4',size,duration:body.duration,createdAt:now()};
  await copyFile(output,join(dir,'media',asset.fileName));await store.update(s=>s.assets.push(asset));return asset;
 }finally{await rm(work,{recursive:true,force:true});}
}
