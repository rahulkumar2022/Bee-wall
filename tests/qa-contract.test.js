import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSave,decodeSave,createPlatform} from '../src/platform.js';

test('personal best never falls below accumulated stars when reading earlier v1 saves',()=>{
  const previous={...freshSave(),unlocked:3,stars:[3,2,1]};
  delete previous.best;
  assert.equal(decodeSave(JSON.stringify(previous)).best,6);
});

test('optional YouTube score follows the official Score object contract',async()=>{
  const scores=[];
  const platform=createPlatform({sdk:{IN_PLAYABLES_ENV:true,engagement:{sendScore:async score=>scores.push(score)}}});
  for(const invalid of [0,Infinity,1.5,121,'3']) assert.equal(await platform.score(invalid),false);
  assert.equal(await platform.score(12),true);
  assert.deepEqual(scores,[{value:12}]);
});

test('late SDK cloud reads never permit writes that could overwrite progress',async()=>{
  let release, writes=0;
  const platform=createPlatform({sdk:{IN_PLAYABLES_ENV:true,game:{loadData:()=>new Promise(resolve=>release=resolve),saveData:async()=>writes++}}});
  assert.equal(await platform.load(5),null);
  release('{"v":1}');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(platform.loadState,'failed');
  assert.equal(await platform.save('{}'),false);
  assert.equal(writes,0);
});
