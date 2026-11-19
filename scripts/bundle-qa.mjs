import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const archive=resolve('release/Bee-Wall-Playables-v1.0.0.zip');
const SDK='https://www.youtube.com/game_api/v1';
const open=(...args)=>execFileSync('unzip',[...args,archive],{encoding:'utf8'});
const sources=html=>[...html.matchAll(/<script(?:\s+src="([^"]+)")?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]??match[2]);

test('Playables ZIP contains only the production entry point and font license',async()=>{
  const entries=open('-Z','-1').trim().split('\n');
  assert.deepEqual(entries,['index.html','OFL-Baloo2.txt']);
  assert.equal(execFileSync('unzip',['-tq',archive],{encoding:'utf8'}).includes('No errors'),true);
  const zipped=execFileSync('unzip',['-p',archive,'index.html'],{encoding:'utf8'});
  const game=await readFile('dist/playables/index.html','utf8');
  assert.equal(zipped,game);
  assert.ok((await stat(archive)).size<512_000);
  assert.ok(Buffer.byteLength(game)<512_000);
  const scripts=sources(game);
  assert.equal(scripts.length,2);assert.equal(scripts[0],SDK);
  assert.ok(scripts[1].includes('firstFrameReady'));
  assert.ok(!scripts[1].includes('visibilitychange'));
  assert.ok(!scripts[1].includes('BeeWallDebug'));
  assert.equal([...game.matchAll(/https:\/\//g)].length,1,'only SDK has a remote URL');
});

test('offline entry point inlines the font and requires no remote SDK load',async()=>{
  const game=await readFile('dist/standalone/index.html','utf8');
  assert.ok(game.includes('data:font/woff2;base64,'));
  assert.ok(!game.includes(SDK));
  assert.equal(sources(game).length,1);
  assert.ok(sources(game)[0].includes('BeeWallDebug'));
});
