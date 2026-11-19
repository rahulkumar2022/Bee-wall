import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Game, HOLD, DT, W, H, DOG_R } from '../src/engine.js';

export const levels = JSON.parse(readFileSync(new URL('../src/levels.json', import.meta.url)));
const readSolutions = () => JSON.parse(readFileSync(new URL('../qa/solutions.json', import.meta.url)));

export function sample(path, spacing, loose = 0) {
  const sampled = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i - 1], [bx, by] = path[i];
    const len = Math.hypot(bx - x, by - y);
    const count = Math.max(1, Math.round(len / spacing));
    for (let j = 1; j <= count; j++) {
      const t = j / count;
      const offset = j === count ? 0 : loose * Math.sin((sampled.length + i * 19) * 2.17);
      sampled.push([x + (bx - x) * t - (by - y) * offset / len,
        y + (by - y) * t + (bx - x) * offset / len]);
    }
  }
  return sampled;
}

export function play(level, path, { spacing = 0, loose = 0, wait = 0, assist = false } = {}) {
  const game = new Game(level, { assist });
  for (let i = 0; i < wait; i++) game.tick();
  const points = spacing ? sample(path, spacing, loose) : path;
  game.begin(...points[0]);
  for (const point of points.slice(1)) {
    game.move(...point);
    if (spacing && game.phase === 'draw') game.tick();
  }
  game.end();
  for (let i = 0; i < Math.round(HOLD / DT) && game.phase === 'run'; i++) game.tick();
  return game;
}

function pointDistance([x, y], path) {
  let distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return distance;
}

export function separation(left, right) {
  const meanDistance = (a, b) => {
    const points = sample(a, 6);
    return points.reduce((sum, p) => sum + pointDistance(p, b), 0) / points.length;
  };
  return (meanDistance(left, right) + meanDistance(right, left)) / 2;
}

const flex = [[3, 0], [-3, 0], [0, 3], [0, -3]];
const clamp = (value, limit) => Math.min(limit, Math.max(0, value));

export function verifyLevel(level, pair) {
  assert.equal(level.world, Math.floor((level.id - 1) / 10));
  assert.equal(Boolean(level.boss), level.id % 10 === 0);
  if (level.world === 1) assert.ok(level.walls.length > 0);
  if (level.world === 2) assert.ok(level.hives.some(hive => hive.path?.length > 1));
  if (level.world === 3) {
    assert.ok(level.hives.length > 1);
    assert.ok(level.hives.reduce((total, hive) => total + hive.n, 0) >= 20);
  }
  assert.equal(pair.length, 2);
  for (const path of pair) {
    assert.ok(path.length >= 2);
    assert.ok(path.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= W && y >= 0 && y <= H));
    const variants = [
      [path, {}],
      [path, { spacing: 10, wait: 170 }],
      [path, { spacing: 8, loose: 2.2, wait: 83 }],
      ...flex.map(([dx, dy]) => [path.map(([x, y]) => [clamp(x + dx, W), clamp(y + dy, H)]), { spacing: 7, loose: 1.6 }]),
      [path, { spacing: 8, loose: 2.2, wait: 105, assist: true }],
    ];
    for (const [stroke, options] of variants) {
      const game = play(level, stroke, options);
      assert.equal(game.phase, 'win', `replay failed at ${game.time}s: ${JSON.stringify(stroke)} ${JSON.stringify(options)}`);
      assert.equal(game.time, HOLD);
      assert.ok(game.budget - game.ink > 32, 'a solution should not be a tiny scribble');
    }
  }
  assert.ok(separation(...pair) >= 17, 'the solutions should follow different defensive routes');
  const tinyControl = play(level, [[15, 76], [30, 76]]);
  assert.equal(tinyControl.phase, 'fail', `off-path stroke must not win (${tinyControl.phase})`);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const [x, y] = level.dog;
    const cx = x + Math.cos(angle) * (DOG_R + 13), cy = y + Math.sin(angle) * (DOG_R + 13);
    const dx = -Math.sin(angle) * 8, dy = Math.cos(angle) * 8;
    const game = play(level, [[cx - dx, cy - dy], [cx + dx, cy + dy]]);
    assert.notEqual(game.phase, 'win', 'a tiny line next to the dog must not win');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const solutions = readSolutions();
  assert.equal(levels.length, 40);
  assert.equal(solutions.length, 40);
  assert.equal(new Set(levels.map(level => level.name)).size, 40);
  let passed = 0;
  for (const [i, level] of levels.entries()) {
    assert.equal(level.id, i + 1);
    try {
      verifyLevel(level, solutions[i]);
      const stars = solutions[i].map(path => play(level, path).stars);
      console.log(`${String(level.id).padStart(2, '0')} ${level.name}: ${stars.join(' / ')} stars`);
      passed++;
    } catch (error) {
      console.error(`${level.id} ${level.name}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`${passed}/${levels.length} levels passed (2 distinct replays, 8 variants per replay).`);
}
