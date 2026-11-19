import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, decodeSave, createPlatform, createSaveQueue } from '../src/platform.js';

const harness = (load = async () => null) => {
  const calls = [], events = {};
  return {calls, events, sdk:{IN_PLAYABLES_ENV:true, game:{
    firstFrameReady:()=>calls.push('frame'), gameReady:()=>calls.push('ready'),
    loadData:()=>{calls.push('load');return load();}, saveData:async text=>calls.push(['save',text])
  }, system:{isAudioEnabled:()=>false, onAudioEnabledChange:fn=>events.audio=fn,
    onPause:fn=>events.pause=fn,onResume:fn=>events.resume=fn}}};
};

test('save decoder falls back on malformed data and sanitizes values',()=>{
  for (const raw of ['', null, '{', 'null', '{"v":99}', '{"v":1,"unlocked":0,"stars":{}}']) assert.deepEqual(decodeSave(raw),freshSave());
  const save=decodeSave(JSON.stringify({v:1,unlocked:4,stars:[3,'3',9,1,3],settings:{sfx:false,music:'false',haptics:false,assist:true,theme:'ultraviolet'}}));
  assert.equal(save.unlocked,4);
  assert.deepEqual(save.stars.slice(0,5),[3,0,0,1,0]);
  assert.deepEqual(save.settings,{sfx:false,music:true,haptics:false,assist:true,theme:'system',autoRetry:false});
});

test('hosted API reports readiness in order and uses SDK-only storage after load',async()=>{
  const {sdk,calls}=harness();
  const platform=createPlatform({sdk,storage:()=>{assert.fail('hosted storage access');}});
  assert.equal(await platform.save('{}'),false);
  platform.ready();
  platform.firstFrame();platform.firstFrame();
  assert.equal(await platform.load(),null);
  platform.ready();platform.ready();
  assert.equal(await platform.save('{"v":1}'),true);
  assert.deepEqual(calls,['frame','load','ready',['save','{"v":1}']]);
});

test('hosted SDK drives pause, resume and platform audio state',()=>{
  const {sdk,events}=harness(), reported=[];
  const platform=createPlatform({sdk});
  assert.equal(platform.initialAudio(),false);
  platform.subscribe({pause:()=>reported.push('pause'),resume:()=>reported.push('resume'),audio:on=>reported.push(on)});
  events.pause(); events.audio(true); events.resume();
  assert.deepEqual(reported,['pause',true,'resume']);
});

test('loading failure does not allow overwriting an unread cloud save',async()=>{
  const {sdk,calls}=harness(async()=>{throw Error('unavailable');});
  const platform=createPlatform({sdk});
  assert.equal(await platform.load(),null);
  assert.equal(await platform.save('{}'),false);
  assert.deepEqual(calls,['load']);
});

test('standalone persists independent of the SDK no-op instance',async()=>{
  const map=new Map(), storage=()=>({setItem:(key,val)=>map.set(key,val),getItem:key=>map.get(key)??null});
  const sdk={IN_PLAYABLES_ENV:false};
  const platform=createPlatform({sdk,storage});
  assert.equal(await platform.load(),null);
  assert.equal(await platform.save('abc'),true);
  assert.equal(await createPlatform({storage}).load(),'abc');
  const sandbox=createPlatform({storage:()=>{throw Error('blocked');}});
  assert.equal(await sandbox.load(),null);
  assert.equal(await sandbox.save('x'),false);
});

test('save queue keeps only latest pending state and does not issue writes during pause',async()=>{
  const writes=[], releases=[];
  const queue=createSaveQueue(text=>{writes.push(text); return new Promise(resolve=>releases.push(resolve));});
  queue.push('old');queue.push('intermediate');queue.pause();queue.push('newest');
  releases.shift()(true); await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes,['old']);
  queue.resume(); assert.deepEqual(writes,['old','newest']);
  releases.shift()(true);
  await queue.idle();
});
