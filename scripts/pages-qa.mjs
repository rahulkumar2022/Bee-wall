import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const assets = ['.nojekyll','OFL-Baloo2.txt','index.html'];

test('Pages output contains only the standalone game, license, and Jekyll marker', async () => {
  assert.deepEqual((await readdir('dist/pages')).sort(), assets);
  const site = await readFile('dist/pages/index.html');
  assert.match(site.toString(), /<title>Bee Wall<\/title>/);
  assert.match(site.toString(), /data:font\/woff2;base64,/);
  assert.match(site.toString(), /visibilitychange/);
  assert.doesNotMatch(site.toString(), /BeeWallDebug|https:\/\/www\.youtube\.com\/game_api/);
  assert.deepEqual(await readFile('dist/pages/OFL-Baloo2.txt'), await readFile('assets/OFL-Baloo2.txt'));
});
