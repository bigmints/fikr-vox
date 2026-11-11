import {linkedVideo} from './timeline-model.js';
// Partition overlaps the same way the preview does: the first visible clip wins.
export function timelineVideoPlan(layout,jobs,{previewRatio='16:9',previewFit='contain'}={}){
 const ready=layout.clips.filter(c=>!c.pending&&linkedVideo(c,jobs));
 if(!ready.length)throw Error('Generate or select a finished video take before exporting video.');
 const boundaries=[...new Set([0,layout.duration,...ready.flatMap(c=>[c.start,c.end])])].sort((a,b)=>a-b),clips=[];
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i],end=boundaries[i+1],c=ready.find(c=>c.start<=start&&c.end>=end);if(!c||end<=start)continue;
  const job=linkedVideo(c,jobs);
  clips.push({assetId:job.outputId,start,duration:end-start,sourceStart:(job.sequence?0:c.range.start)+start-c.start});
 }
 return {duration:layout.duration,ratio:previewRatio,fit:previewFit,clips};
}
