import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright';

const chrome = process.env.BEE_CHROME ?? [
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].find(existsSync);

async function browserModule(name, check) {
  const source = await readFile(new URL(`../src/${name}.js`, import.meta.url));
  const browser = await chromium.launch({ executablePath: chrome, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.evaluate(async url => { globalThis.production = await import(url); }, `data:text/javascript;base64,${source.toString('base64')}`);
    await check(page);
  } finally {
    await browser.close();
  }
}

test('drawBoard paints the logical field and preserves the caller’s transform', { skip: !chrome }, async () => {
  await browserModule('art', page => page.evaluate(() => {
    const { drawBoard } = globalThis.production;
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const game = {
      level: { id: 1, name: 'First Flight', world: 0, dog: [270, 520], walls: [] },
      phase: 'draw', age: 0, time: 0, drawing: false, points: [], ink: 520, budget: 520,
      hives: [{ x: 60, y: 90 }], bees: [{ x: 78, y: 102, vx: 2, vy: 3 }], hit: null, stars: 0,
    };
    drawBoard(ctx, game);
    const light = ctx.getImageData(360, 640, 1, 1).data;
    drawBoard(ctx, game, { dark: true });
    const dark = ctx.getImageData(360, 640, 1, 1).data;
    if (light[3] !== 255 || dark[3] !== 255 || light[0] - dark[0] < 80) throw Error('both themes must fill the board');
    if (ctx.getImageData(719, 1279, 1, 1).data[3] !== 255) throw Error('board stops before 360 × 640');
    const matrix = ctx.getTransform();
    if (matrix.a !== 2 || matrix.d !== 2 || matrix.e !== 0 || matrix.f !== 0) throw Error('caller transform changed');
  }));
});

test('reduced-motion art freezes the idle swarm but not active flight', { skip: !chrome }, async () => {
  await browserModule('art', page => page.evaluate(() => {
    const { drawBoard } = globalThis.production;
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bee = { x: 152, y: 142, vx: 4, vy: 2 };
    const game = {
      level: { id: 1, world: 0, dog: [174, 402], walls: [] },
      phase: 'draw', age: 0, time: 0, drawing: false, points: [],
      hives: [{ x: 132, y: 148 }], bees: [bee], hit: null, stars: 0,
    };
    const pixels = () => ctx.getImageData(143, 132, 19, 19).data;
    const equal = (a, b) => a.every((v, i) => v === b[i]);
    drawBoard(ctx, game, { reduced: true, hint: true });
    const still = pixels();
    game.age = 1.2;
    bee.x = 170;
    drawBoard(ctx, game, { reduced: true, hint: true });
    if (!equal(still, pixels())) throw Error('idle swarm still orbits in reduced motion');
    game.phase = 'run';
    drawBoard(ctx, game, { reduced: true });
    if (equal(still, pixels())) throw Error('reduced motion hides real bee movement');
  }));
});

test('createSound is safe without Web Audio', async () => {
  const { createSound } = await import('../src/sound.js');
  const sound = createSound();
  assert.doesNotThrow(() => {
    sound.set({ allowed: true, paused: false, music: true, sfx: true });
    sound.update({ phase: 'run', danger: .6 });
    sound.cue('release');
  });
  await sound.unlock();
});

test('Web Audio is gesture-gated, mutes, and restores each group', { skip: !chrome, timeout: 20_000 }, async () => {
  await browserModule('sound', async page => {
    await page.setContent('<button>Unlock</button>');
    await page.evaluate(() => {
      const NativeContext = globalThis.AudioContext;
      globalThis.AudioContext = class extends NativeContext {
        constructor() {
          super();
          globalThis.meter = this.createAnalyser();
          meter.fftSize = 256;
          meter.connect(super.destination);
        }
        get destination() { return globalThis.meter; }
      };
      globalThis.sound = production.createSound();
      sound.set({ allowed: true, paused: false, sfx: true, music: false });
      sound.update({ phase: 'run', danger: .8 });
      sound.cue('win');
      if (globalThis.meter) throw Error('AudioContext created before unlock');
      document.querySelector('button').onclick = () => sound.unlock();
    });
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.evaluate(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const samples = new Float32Array(256);
      const amplitude = () => {
        meter.getFloatTimeDomainData(samples);
        return samples.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0);
      };
      const audible = async label => {
        for (let i = 0; i < 26; i++) {
          if (amplitude() > .001) return;
          await wait(30);
        }
        throw Error(label + ' is silent');
      };
      const quiet = async label => {
        await wait(55);
        if (amplitude() > .0001) throw Error(label + ' did not silence output');
      };
      await audible('bee buzz');
      sound.set({ allowed: false });
      sound.cue('win');
      await quiet('platform mute');
      sound.set({ allowed: true });
      await audible('restored bee buzz');
      sound.set({ paused: true });
      await quiet('platform pause');
      sound.set({ paused: false, sfx: false, music: false });
      await quiet('SFX toggle');
      sound.set({ music: true });
      await audible('music with SFX off');
      sound.set({ music: false });
      await quiet('music toggle');
      sound.set({ sfx: true });
      sound.update({ phase: 'draw', drawing: true, speed: 0 });
      await quiet('stationary stylus');
      sound.update({ phase: 'draw', drawing: true, speed: 400 });
      await audible('moving stylus');
      sound.update({ phase: 'draw', drawing: false });
      await quiet('finished stroke');
      sound.cue('release');
      await audible('release cue');
      sound.set({ paused: true });
      await quiet('paused cue');
      sound.set({ paused: false });
      await quiet('stale cue after resume');
    });
  });
});
