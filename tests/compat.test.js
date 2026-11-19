import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, HOLD, DT } from '../src/engine.js';

const levels=JSON.parse(readFileSync(new URL('../src/levels.json',import.meta.url)));
const solutions=JSON.parse(readFileSync(new URL('../qa/solutions.json',import.meta.url)));

test('stroke and moving-hive flight work without the newer Array.at API',()=>{
  const original=Array.prototype.at;
  Array.prototype.at=undefined;
  try {
    const game=new Game(levels[20]);
    const path=solutions[20][0];
    game.begin(...path[0]);
    for(const point of path.slice(1)) game.move(...point);
    game.end();
    for(let k=0;k<Math.round(HOLD/DT);k++) game.tick();
    assert.equal(game.phase,'win');
  } finally {Array.prototype.at=original;}
});
