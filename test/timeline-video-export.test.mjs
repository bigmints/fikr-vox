import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeAudio,videoAtTime} from '../public/timeline-model.js';
import {timelineVideoPlan} from '../public/timeline-video.js';
import {validateVideoPlan} from '../lib/timeline-video.mjs';
const job=(sectionId,sourceJobId,outputId,extra={})=>({id:outputId,kind:'video',sectionId,sourceJobId,outputId,status:'completed',...extra});
test('export follows preview priority, selected takes, trims, gaps and overlapping tracks',()=>{
 const layout=arrangeAudio([
  {sec:{id:'a',offset:1,trackId:'voice',trims:{audio:{start:2,end:4}},videoTakeId:'chosen'},take:{id:'voice-a',outputId:'audio'},duration:5},
  {sec:{id:'b',offset:2,trackId:'music'},take:{id:'voice-b',outputId:'music'},duration:3}
 ],[{id:'voice',volume:.6},{id:'music',volume:.2}]);
 const jobs=[job('a','voice-a','old'),job('a','voice-a','chosen'),job('b','voice-b','second')];
 const plan=timelineVideoPlan(layout,jobs,{previewRatio:'9:16',previewFit:'cover'});
 assert.equal(plan.duration,5);assert.equal(plan.ratio,'9:16');assert.equal(plan.fit,'cover');
 assert.deepEqual(plan.clips,[{assetId:'chosen',start:1,duration:1,sourceStart:2},{assetId:'chosen',start:2,duration:1,sourceStart:3},{assetId:'second',start:3,duration:2,sourceStart:1}]);
 for(const c of plan.clips){const preview=videoAtTime(layout.clips,jobs,c.start);assert.equal(c.assetId,preview.job.outputId);assert.equal(c.sourceStart,preview.time);}
 validateVideoPlan(plan);
});
test('assembled scene video starts at its own beginning and stale video cannot export',()=>{
 const layout=arrangeAudio([{sec:{id:'s',trims:{audio:{start:3,end:6}}},take:{id:'v',outputId:'audio'},duration:8}]);
 assert.equal(timelineVideoPlan(layout,[job('s','v','scene',{sequence:{}})]).clips[0].sourceStart,0);
 assert.throws(()=>timelineVideoPlan(layout,[job('s','old','stale')]),/finished video/);
});
test('backend rejects invalid durations, overlapping clips and bad output settings',()=>{
 const plan={duration:4,ratio:'16:9',fit:'contain',clips:[{assetId:'video',start:0,duration:2,sourceStart:0}]};
 validateVideoPlan(plan);
 for(const invalid of [{duration:Infinity},{duration:7201},{ratio:'bad'},{fit:'stretch'},{clips:[]},{clips:[{...plan.clips[0],sourceStart:-1}]},{clips:[...plan.clips,{...plan.clips[0],start:1}]}])assert.throws(()=>validateVideoPlan({...plan,...invalid}));
});

test('macOS exporter creates a saved MP4 from a timeline mix and cleans temporary files',{skip:process.platform!=='darwin'},async t=>{
 const {mkdtemp,mkdir,copyFile,writeFile,readFile,readdir,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {createStore}=await import('../lib/store.mjs');
 const {exportTimelineVideo}=await import('../lib/timeline-video.mjs');
 const {timelineWav}=await import('../public/timeline-export.js');
 const dir=await mkdtemp(join(tmpdir(),'mytwin-video-export-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'media'));const store=await createStore(dir);
 await promisify(execFile)('/usr/bin/swift',['-suppress-warnings',new URL('./fixtures/make-video.swift',import.meta.url).pathname,join(dir,'media','video.mp4')]);
 await writeFile(join(dir,'media','mix.wav'),timelineWav([{channels:[new Float32Array(48000*3).fill(.1)]}]));
 await store.update(s=>s.assets.push({id:'video',fileName:'video.mp4',type:'video/mp4'},{id:'audio',fileName:'mix.wav',type:'audio/wav'}));
 const asset=await exportTimelineVideo(store,dir,{duration:3,ratio:'1:1',fit:'cover',audioId:'audio',name:'Episode.mp4',clips:[{assetId:'video',start:.5,duration:1.5,sourceStart:1.8}]});
 assert.equal(asset.name,'Episode.mp4');assert.equal(asset.type,'video/mp4');assert.ok(asset.size>1000);
 const bytes=await readFile(join(dir,'media',asset.fileName));assert.equal(bytes.subarray(4,8).toString(),'ftyp');
 assert.ok(store.read().assets.some(a=>a.id===asset.id));
 assert.deepEqual((await readdir(dir)).filter(n=>n.startsWith('timeline-export-')),[]);
});
