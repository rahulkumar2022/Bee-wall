import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../src/engine.js';
import { levels, verifyLevel } from '../scripts/verify-levels.mjs';
const { Game, HOLD, DT } = engine;

const level = (overrides = {}) => ({
  id: 1, name: 'Test field', world: 0, dog: [180, 330], ink: 130,
  hives: [], walls: [], ...overrides,
});

test('an overlong pointer segment is clipped at the exact ink limit and starts the run', () => {
  assert.equal(typeof Game, 'function', 'the game engine must export Game');
  const game = new Game(level({ ink: 50 }));
  game.begin(10, 30);
  game.move(130, 120); // 150px diagonal; one third of the segment should remain.
  assert.deepEqual(game.points, [{ x: 10, y: 30 }, { x: 50, y: 60 }]);
  assert.equal(game.ink, 0);
  assert.equal(game.phase, 'run');
  assert.equal(game.drawing, false);
});

test('an outside-to-outside pointer jump may not cross the dog', () => {
  const game = new Game(level({ ink: 170 }));
  game.begin(130, 330);
  assert.equal(game.move(230, 330), false);
  assert.deepEqual(game.points, [{ x: 130, y: 330 }]);
  assert.equal(game.ink, 170);
  assert.equal(game.move(130, 375), true);
});

test('pointer jitter and a short tap return their ink without releasing bees', () => {
  const game = new Game(level());
  game.begin(20, 20);
  assert.equal(game.move(22, 21), false);
  assert.equal(game.move(26, 20), true);
  assert.equal(game.end(), false);
  assert.equal(game.phase, 'draw');
  assert.deepEqual(game.points, []);
  assert.equal(game.ink, game.budget);
});

test('cancel discards an otherwise valid stroke before a following pointer up', () => {
  const game = new Game(level());
  game.begin(20, 20);
  game.move(50, 20);
  game.cancel();
  assert.equal(game.end(), false);
  assert.deepEqual(game.points, []);
  assert.equal(game.ink, game.budget);
  assert.equal(game.phase, 'draw');
  assert.equal(game.drawing, false);
});

test('only empty space accepts a stroke start, including open field edges', () => {
  const game = new Game(level({ hives: [{ x: 100, y: 100, n: 3 }], walls: [[20, 120, 160, 120]] }));
  for (const [x, y] of [[180, 330], [100, 100], [100, 120], [NaN, 50]]) {
    assert.equal(game.begin(x, y), false);
  }
  assert.equal(game.begin(0, 50), true);
  assert.equal(game.move(100, 120), true, 'endpoints may join built-in walls');
});

function release(game) {
  game.begin(10, 20);
  game.move(42, 20);
  game.end();
}

test('the run wins on the 300th tick regardless of idle time', () => {
  const game = new Game(level());
  for (let i = 0; i < 105; i++) game.tick();
  assert.equal(game.age, 105 / 60);
  assert.equal(game.time, 0);
  release(game);
  for (let i = 1; i < 300; i++) game.tick();
  assert.equal(DT, 1 / 60);
  assert.equal(game.time, 299 / 60);
  assert.equal(game.phase, 'run');
  game.tick();
  assert.equal(game.time, HOLD);
  assert.equal(game.phase, 'win');
  assert.equal(game.stars, 3);
  game.tick();
  assert.equal(game.time, HOLD);
});

test('star cutoffs include exactly 50% and 20% of the starting ink', () => {
  assert.equal(engine.starRating?.(50, 100), 3);
  assert.equal(engine.starRating?.(49.99, 100), 2);
  assert.equal(engine.starRating?.(20, 100), 2);
  assert.equal(engine.starRating?.(19.99, 100), 1);
  assert.equal(engine.starRating?.(0, 100), 1);
});

test('a fast bee records its first touch, even if the step would clear the dog', () => {
  const game = new Game(level({ speed: 30000, hives: [{ x: 65, y: 330, n: 1 }] }));
  release(game);
  game.tick();
  assert.equal(game.phase, 'fail');
  assert.equal(game.stars, 0);
  assert.equal(game.time, DT);
  assert.ok(Math.abs(Math.hypot(game.hit.x - 180, game.hit.y - 330) - (engine.DOG_R + engine.BEE_R)) < 1e-6);
  assert.deepEqual(game.hit, { x: game.bees[0].x, y: game.bees[0].y });
});

test('time spent in draw only animates the idle orbit, never changes the seeded attack', () => {
  const input = level({ hives: [{ x: 60, y: 160, n: 6 }], speed: 50 });
  const a = new Game(input);
  const b = new Game(input);
  for (let i = 0; i < 113; i++) b.tick();
  assert.equal(b.bees.length, 6);
  assert.notDeepEqual(a.bees, b.bees);
  release(a);
  release(b);
  for (let i = 0; i < 70; i++) {
    a.tick();
    b.tick();
  }
  assert.deepEqual(a.bees, b.bees);
  assert.ok(new Set(a.bees.map(bee => bee.vx)).size > 1, 'bees steer individually');
});

test('assist mode increases the ink by 50% and slows the same seeded bee', () => {
  const input = level({ ink: 105, hives: [{ x: 70, y: 115, n: 1 }] });
  const normal = new Game(input);
  const assist = new Game(input, { assist: true });
  assert.equal(assist.budget, 157.5);
  release(normal);
  release(assist);
  normal.tick();
  assist.tick();
  assert.ok(Math.hypot(assist.bees[0].vx, assist.bees[0].vy) < Math.hypot(normal.bees[0].vx, normal.bees[0].vy));
});

test('a fixed wall blocks a high speed step while preserving tangent motion', () => {
  const input = level({ speed: 24000, hives: [{ x: 45, y: 260, n: 1 }], walls: [[128, 0, 128, 640]] });
  const game = new Game(input);
  release(game);
  game.tick();
  assert.equal(game.phase, 'run');
  assert.ok(game.bees[0].x <= 128 - engine.FIXED_WALL_R - engine.BEE_R + 1e-6);
  assert.ok(game.bees[0].y > 340, 'travel slides along the wall instead of stopping at first impact');
  assert.equal(game.bees[0].vx, 0);
});

test('a long fast stroke forms a solid diagonal capsule, including its joins', () => {
  const game = new Game(level({ ink: 660, speed: 30000, hives: [{ x: 45, y: 320, n: 1 }] }));
  game.begin(70, 0);
  game.move(110, 320);
  game.move(150, 640);
  game.end();
  for (let i = 0; i < 3; i++) {
    game.tick();
    assert.equal(game.phase, 'run');
    const { x, y } = game.bees[0];
    assert.ok((70 + y / 8 - x) / Math.hypot(1, 1 / 8) >= engine.BEE_R + engine.STROKE_R - 1e-6);
  }
});

test('a moving hive starts on release and late bees launch along its authored path', () => {
  const hive = { x: 60, y: 110, n: 2, path: [[60, 110], [140, 110], [140, 190]], period: 4, release: 1 };
  const game = new Game(level({ dog: [300, 530], speed: 65, hives: [hive] }));
  for (let i = 0; i < 200; i++) game.tick();
  assert.deepEqual(game.hives[0], { x: 60, y: 110 });
  release(game);
  for (let i = 0; i < 59; i++) game.tick();
  assert.equal(game.bees[1].active, false);
  game.tick();
  assert.deepEqual(game.hives[0], { x: 140, y: 110 });
  assert.equal(game.bees[1].active, true);
  assert.ok(game.bees[1].x > 110);
  for (let i = 0; i < 60; i++) game.tick();
  assert.deepEqual(game.hives[0], { x: 140, y: 190 });
  for (let i = 0; i < 60; i++) game.tick();
  assert.deepEqual(game.hives[0], { x: 140, y: 110 });
});

test('a swarm eventually rounds the end of a short unanchored barrier', () => {
  const game = new Game(level({ speed: 96, seed: 1, hives: [{ x: 75, y: 329, n: 10 }] }));
  game.begin(130, 310);
  game.move(130, 350);
  game.end();
  for (let i = 0; i < 60; i++) game.tick();
  assert.equal(game.phase, 'run', 'the barrier initially holds');
  for (let i = 60; i < 300 && game.phase === 'run'; i++) game.tick();
  assert.equal(game.phase, 'fail', 'the bees eventually use the gap');
});

const replays = JSON.parse(readFileSync(new URL('../qa/solutions.json', import.meta.url)));

test('the level catalog has exactly forty named levels and a pair per level', () => {
  assert.equal(levels.length, 40);
  assert.equal(replays.length, levels.length);
  assert.equal(new Set(levels.map(level => level.name)).size, 40);
});

for (const [index, stage] of levels.entries()) {
  test(`level ${index + 1}: ${stage.name} has two nontrivial, distinct winning strokes`, () => {
    assert.equal(stage.id, index + 1);
    verifyLevel(stage, replays[index]);
  });
}
