import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeAudio,playbackPlan,playbackPosition,playbackRate,timelinePlaybackRates} from '../public/timeline-model.js';

const clips=()=>arrangeAudio([
 {sec:{id:'voice',offset:2,trims:{voice:{start:1,end:7}}},take:{outputId:'voice'},duration:8},
 {sec:{id:'music',trackId:'music',offset:5},take:{outputId:'music'},duration:10}
],[{id:'voice',volume:1},{id:'music',volume:.35}]).clips;

test('preview speed scales scheduling delays while retaining source trims and durations',()=>{
 for(const rate of timelinePlaybackRates){
  const plan=playbackPlan(clips(),3,rate);
  assert.deepEqual(plan.map(p=>[p.id,p.offset,p.duration]),[['voice',2,5],['music',0,10]]);
  assert.equal(plan[0].delay,0);assert.equal(plan[1].delay,2/rate);
  assert.equal(3+plan[1].delay*rate,5);
 }
});
test('preview clock advances at the selected speed without jumping before the audio anchor',()=>{
 for(const rate of timelinePlaybackRates){
  assert.equal(playbackPosition(3,2,rate,20),3+2*rate);
  assert.equal(playbackPosition(3,-.03,rate,20),3);
 }
 assert.equal(playbackPosition(19,4,2,20),20);
});
test('changing speed or seeking reschedules the remaining audio from the same source position',()=>{
 const at=playbackPosition(3,2,1.5,15);
 assert.equal(at,6);
 const resumed=playbackPlan(clips(),at,.5);
 assert.deepEqual(resumed.map(p=>[p.id,p.offset,p.duration,p.delay]),[['voice',5,2,0],['music',1,9,0]]);
 assert.equal(playbackPosition(at,2,.5,15),7);
 assert.deepEqual(playbackPlan(clips(),15,2),[]);
});
test('missing or invalid saved speeds fall back to normal playback',()=>{
 for(const value of [undefined,null,0,-1,Infinity,NaN,'wrong',3])assert.equal(playbackRate(value),1);
 assert.equal(playbackRate('1.5'),1.5);
 assert.deepEqual(playbackPlan(clips(),0,0),playbackPlan(clips(),0,1));
});
