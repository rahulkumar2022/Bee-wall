// All coordinates are in the 360 × 640 playfield; the caller owns scaling and clipping.
const W = 360, H = 640, TAU = Math.PI * 2, HOLD = 5;
const PLUM = '#2A1A3E', BUTTER = '#FFF1C4', CREAM = '#F6E7B8';
const HONEY = '#F5B800', GRASS = '#6CC36A', NIGHT = '#1E1530';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const paths = new Map();
const backgrounds = new Map();
const restingSwarms = new WeakMap();
let beeFrames;

function shape(c, d, fill, stroke, width = 1) {
  let p = paths.get(d);
  if (!p) paths.set(d, p = new Path2D(d));
  if (fill) { c.fillStyle = fill; c.fill(p); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(p); }
}

function oval(c, x, y, rx, ry, fill, stroke, width = 1, rotation = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rotation, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}

function arc(c, x, y, radius, start, end, color, width) {
  c.beginPath(); c.arc(x, y, radius, start, end);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function line(c, x1, y1, x2, y2, color, width) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

function surface(c, w, h) {
  const sheet = c.canvas?.ownerDocument?.createElement('canvas') ??
    (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : null);
  if (!sheet) return null;
  sheet.width = w; sheet.height = h;
  return sheet;
}

// Tones are deliberately close in value. The board center stays substrate, not scenery.
const DAY_SCENERY = [
  ['#e0e8ab', '#d1df9e', '#afc07c', '#edd791', '#fff5cf'], // meadow
  ['#f8e4ac', '#edd09a', '#d7af79', '#f6db92', '#fff5ce'], // barn
  ['#e3e7bd', '#d6dfad', '#b6c392', '#e5c7a4', '#f4efd0'], // garden
  ['#eae5b2', '#dcd89d', '#c3c488', '#e5b786', '#fff2c6'], // orchard
];
const NIGHT_SCENERY = [
  ['#2c2941', '#363047', '#494358', '#50424e', '#272138'],
  ['#33263e', '#3e2c43', '#52394e', '#503950', '#292035'],
  ['#28303d', '#313a45', '#465058', '#51394e', '#272439'],
  ['#302d40', '#383746', '#4a4957', '#533d4d', '#292339'],
];

function tuft(c, x, y, s, color) {
  c.save(); c.translate(x, y); c.scale(s, s);
  shape(c, 'M-6 0q-1-4-4-6 M0 0q-1-5 0-10 M4 0q1-4 5-8', null, color, 1.45);
  c.restore();
}

function bloom(c, x, y, s, stem, petal, core) {
  c.save(); c.translate(x, y); c.scale(s, s);
  shape(c, 'M-2 11q4-7 2-11 M-1 9q-4-5-8-3q2 4 8 3 M0 6q5-4 8-3q-3 4-8 3', null, stem, 1.4);
  shape(c, 'M0-4C2-9 7-6 5-2C10 0 7 4 3 3C2 8-3 7-4 3C-9 3-10-2-5-3C-7-7-2-9 0-4Z', petal, stem, .7);
  oval(c, 0, 0, 2.4, 2.2, core);
  c.restore();
}

function meadow(c, p) {
  const [base, shadow, edge, bud, soft] = p;
  shape(c, 'M0 0H360V18C335 37 297 20 273 35S224 57 186 45S107 17 77 35S25 53 0 43Z', base);
  shape(c, 'M360 94C317 112 346 154 339 178S316 205 326 241S350 272 360 281Z M0 218C30 242 10 280 30 304S39 351 0 377Z', base);
  shape(c, 'M0 511C43 485 63 516 75 535S97 560 123 563C164 568 152 614 221 612C281 611 285 550 360 553V640H0Z', base);
  shape(c, 'M0 597C42 572 67 596 83 613S120 641 157 633 M241 640C287 625 280 594 360 581', null, shadow, 2.5);
  shape(c, 'M0 22c22 3 36-8 55-8m238 8c24-7 39 2 67-8M348 195q-9 18-3 37M4 268q3 29 15 43', null, shadow, 1.6);
  for (const [x, y, s] of [[18, 27, .7], [336, 24, .8], [349, 224, .8], [15, 329, .75], [67, 565, .9], [99, 608, 1], [306, 607, 1.2], [337, 578, .9], [27, 537, .7], [40, 612, .8]]) tuft(c, x, y, s, edge);
  bloom(c, 21, 570, 1.24, edge, soft, bud); bloom(c, 37, 584, .76, edge, soft, bud);
  bloom(c, 328, 602, 1.4, edge, soft, bud); bloom(c, 346, 622, 1, edge, soft, bud);
  bloom(c, 13, 309, .74, edge, soft, bud); bloom(c, 347, 176, .78, edge, soft, bud);
}

function barn(c, p) {
  const [base, shadow, edge, straw, soft] = p;
  shape(c, 'M0 0H360V54L317 46L285 54L249 45L199 51L166 40L130 43L105 35L71 42L33 29L0 36Z M0 0H22L19 119L26 229L18 336L30 409L23 527L35 640H0Z M360 0H335L339 83L332 178L341 293L338 439L326 543L333 640H360Z M0 578L58 581L102 596L177 591L225 607L286 586L360 591V640H0Z', base);
  shape(c, 'M0 16q88-8 161 7t199 5M7 68l2 121-3 111 6 114m335-354 3 114-2 123 1 90M6 612q109-11 177 6t177-3', null, shadow, 2);
  shape(c, 'M0 12L84 28L173 12L260 31L360 11', null, edge, 1.2);
  shape(c, 'M24 17l15 3-12 14zM66 25l16 3-8 14zM111 24l16-3-5 16zM218 22l16 3-11 13zM279 25l16-3-4 16zM320 19l17-4-4 15z', straw, edge, .7);
  c.save(); c.translate(33, 604); c.rotate(-.11);
  shape(c, 'M-29 0Q-28-9-17-11H24Q32-9 33 1V16Q32 21 23 21H-22Q-30 20-29 13Z', straw, edge, 1.2);
  shape(c, 'M-22-5h45m-46 5 41 1m-43 7 47-1m-43 6 45 1M-11-11v31M16-10l-2 30', null, edge, 1.25);
  c.restore();
  c.save(); c.translate(336, 610); c.rotate(.18);
  shape(c, 'M-25-5Q-24-13-15-14H25Q32-11 31-4V13H-24Z', straw, edge, 1.2);
  shape(c, 'M-19-7h43m-40 6 34 1m-37 7h42M-8-14L-9 13M11-14l-1 27', null, edge, 1.2);
  c.restore();
  for (const [x, y] of [[8, 84], [12, 250], [13, 439], [349, 111], [346, 263], [343, 483], [117, 609], [249, 609]]) {
    oval(c, x, y, 2, 3.1, shadow, edge, .8, -.3);
    line(c, x - 1, y + .5, x + 1, y - .5, soft, .8);
  }
}

function leafStem(c, x, y, s, angle, leaves, edge) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(s, s);
  shape(c, 'M0 0Q-4-27 4-62 M0-17Q-20-15-25-33Q-10-35 0-21 M0-31Q16-48 24-42Q18-26 0-28 M2-42Q-13-47-12-58Q0-57 2-47 M4-54Q2-67 12-73Q18-60 4-54', leaves, edge, 1);
  c.restore();
}

function garden(c, p) {
  const [base, shadow, edge, buds, soft] = p;
  shape(c, 'M0 0H360V38Q322 59 297 37Q273 13 224 26Q172 37 142 26Q80 8 53 45Q30 81 0 76Z M0 383Q34 400 23 441Q17 466 31 486Q59 539 40 555Q77 566 88 601Q124 613 135 640H0Z M360 334Q331 359 339 405Q349 452 326 512Q303 557 285 568Q267 581 246 640H360Z', base);
  for (const [x, y, s, a] of [[7, 87, .85, .7], [29, 53, .7, .4], [337, 47, .64, -.65], [350, 407, .57, -.62], [348, 557, .84, -.74], [318, 623, 1.12, .38], [20, 597, 1.2, -.2], [63, 627, .89, -.36], [1, 502, .8, .28]]) leafStem(c, x, y, s, a, shadow, edge);
  for (const [x, y, s] of [[36, 579, 1.35], [45, 606, 1], [332, 542, .92], [303, 592, 1.4], [14, 68, .8], [327, 34, 1]]) bloom(c, x, y, s, edge, buds, soft);
  shape(c, 'M-2 111q13 7 18-1q-2-8-10-3Q2 111 8 111 M338 573q10 6 16-3q2-7-4-7q-6 1-4 6', null, edge, 1.2);
}

function apple(c, x, y, p) {
  const [, , edge, fruit, soft] = p;
  c.save(); c.translate(x, y);
  shape(c, 'M0-3C-5-7-9-2-7 3Q-4 10 0 7Q5 9 8 3Q10-6 4-5Z', fruit, edge, .75);
  shape(c, 'M1-4q-2-4 1-6m-5 8-1 3', null, soft, 1.15);
  c.restore();
}

function orchard(c, p) {
  const [base, shadow, edge, fruit] = p;
  shape(c, 'M0 0H360V67Q332 82 312 60Q295 66 283 45Q257 52 244 31Q212 45 187 18Q158 35 126 21Q112 49 81 38Q72 63 49 56Q31 86 0 64Z M0 411Q19 415 20 444Q45 453 30 483Q53 499 34 521Q64 545 52 565Q105 571 117 604Q132 601 166 640H0Z M360 410Q331 427 343 462Q317 479 331 503Q310 519 321 549Q273 573 284 595Q252 601 226 640H360Z', base);
  shape(c, 'M0 26q19 26 44 13q14-5 19-21 M272 21q10 25 34 21q20 23 54 10 M0 572q64 4 78 48m275-63q-44 8-64 47', null, shadow, 2.3);
  for (const [x, y] of [[25, 37], [54, 20], [113, 20], [309, 33], [336, 56], [17, 483], [35, 542], [60, 594], [338, 512], [326, 554], [304, 592]]) apple(c, x, y, p);
  for (const [x, y, s] of [[16, 558, .8], [49, 611, .75], [341, 582, .85], [350, 440, .8]]) tuft(c, x, y, s, edge);
  shape(c, 'M13 618l39-2-3 21H17Z M311 618l39-3-3 22h-34Z', shadow, edge, 1.2);
  shape(c, 'M12 618q18-14 41-2m258 2q17-16 39-3M19 627h26m274 0h25', null, fruit, 2);
}

const scenery = [meadow, barn, garden, orchard];

function paintBackground(c, world, dark) {
  const t = (dark ? NIGHT_SCENERY : DAY_SCENERY)[world];
  c.fillStyle = dark ? NIGHT : BUTTER;
  c.fillRect(0, 0, W, H);
  c.lineCap = 'round'; c.lineJoin = 'round';
  shape(c, 'M-12 129Q84 137 133 71Q171 25 223 66Q281 120 371 75L371 104Q288 153 218 94Q170 60 148 102Q86 170-12 151Z M-14 501Q59 444 115 486Q153 510 199 493Q285 455 377 491V510Q279 484 199 523Q149 541 105 516Q58 488-14 522Z', t[4]);
  scenery[world](c, t);
  // Fixed placement keeps the paper grain quiet instead of glittering as the board animates.
  let seed = 617 + world * 41;
  for (let i = 0; i < 145; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const x = (seed >>> 16) % W, y = (seed & 65535) % H;
    c.globalAlpha = i % 5 === 0 ? .24 : .12;
    c.fillStyle = t[2];
    c.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
  }
  c.globalAlpha = 1;
}

function boardBackground(c, world, dark) {
  const key = `${world}:${dark}`;
  let sheet = backgrounds.get(key);
  if (!sheet) {
    sheet = surface(c, W * 2, H * 2);
    const s = sheet?.getContext('2d');
    if (!s) { paintBackground(c, world, dark); return; }
    s.scale(2, 2);
    paintBackground(s, world, dark);
  } else backgrounds.delete(key);
  backgrounds.set(key, sheet);
  if (backgrounds.size > 2) backgrounds.delete(backgrounds.keys().next().value);
  c.drawImage(sheet, 0, 0, W, H);
}

function wall(c, [ax, ay, bx, by], dark, world) {
  const length = Math.hypot(bx - ax, by - ay);
  if (!length) return;
  c.save(); c.translate(ax, ay); c.rotate(Math.atan2(by - ay, bx - ax));
  const border = dark ? '#b7a8a3' : '#5b3a40';
  const body = (dark ? ['#534963', '#6a494f', '#465e58', '#5a544a'] : ['#b08d78', '#c48453', '#8da175', '#b28a59'])[world];
  line(c, 0, .65, length, .65, border, 14);
  line(c, 0, 0, length, 0, body, 10.5);
  for (let x = 6; x < length - 3; x += 14) line(c, x - 2, -2, x + 2, 3, border, 1.6);
  line(c, 1, -3.5, length - 1, -3.5, dark ? '#d1b9aa' : '#f4d4a5', 1.25);
  oval(c, 0, 0, 2, 2.3, border); oval(c, length, 0, 2, 2.3, border);
  c.restore();
}

function ink(c, points, dark, drawing) {
  if (!points.length) return;
  const color = dark ? CREAM : PLUM;
  const tip = points[points.length - 1];
  if (points.length > 1) {
    c.beginPath(); c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.strokeStyle = color; c.lineWidth = 8; c.stroke();
  } else oval(c, tip.x, tip.y, 4, 4, color);
  if (drawing) oval(c, tip.x, tip.y, 5.4, 5.4, color, dark ? NIGHT : BUTTER, 1.35);
}

export function drawHive(c, x, y, { dark = false, alert = false } = {}) {
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
  oval(c, 0, 18, 21, 6, dark ? '#36383f' : '#d0d49b');
  shape(c, 'M-6-18q1-7 7-7q7 2 6 8', null, dark ? CREAM : PLUM, 2.3);
  shape(c, 'M-9-18q9-4 18 0l4 5q8 3 8 10q5 5 2 11q4 8-6 12q-18 4-35-1q-7-2-5-9q-4-8 1-13q1-8 8-10Z', '#e8a32b', PLUM, 2.7);
  shape(c, 'M-20 5q-3-6 0-10q1-6 7-8l4-5q9-3 17 0l5 5q6 2 7 8q2 4 0 8q-15 7-40 2Z', '#f7c24f');
  shape(c, 'M-14-12q14 4 27 0M-21-5q17 5 41 0M-23 3q19 6 45 0M-22 11q8 3 14 2m16 0q9 0 14-3', null, '#945334', 1.55);
  shape(c, 'M-6 15v-5C-6 0 6 0 6 10v5q-5 2-12 0Z', PLUM);
  shape(c, 'M-10 10q1-9 9-10q8 0 10 8', null, '#ffe1a1', 1.65);
  shape(c, 'M-15-8l4 1m-9 8 4 1m29 11 3-1', null, '#ffe7a1', 1.2);
  if (alert) oval(c, 1, 12, 3.3, 1.4, '#ff8e46');
  c.restore();
}

const MUZZLE = 'M-19 4C-19-2-11-5-3-2C6-6 18-4 21 3C25 15 15 21 2 20C-12 22-24 14-19 4Z';
const HEAD = 'M-22-9Q-23-22-12-25Q-9-33-2-28Q3-34 4-27Q17-29 22-18Q28-9 22 6Q20 19 5 22Q-15 23-21 13Q-25 6-22-9Z';
const LEFT_EAR = 'M-16-22C-25-28-29-20-33-11C-38 1-33 11-27 9C-22 8-22 3-21-2Q-21-13-16-18Z';
const RIGHT_EAR = 'M15-24q5-7 10-5q6 3 8 10q3 10-3 12q-7 3-11-8Z';
const BODY = 'M-18 16Q-24 24-21 30Q-20 33-13 32L-6 31Q2 34 10 32Q20 34 22 29Q23 23 16 16Z';
const TAIL = 'M14 25q11 2 16-5q4-5 5-2q5 12-8 15q-8 2-13-3Z';

function eye(c, x, y, rx, ry, look, blink) {
  if (blink) {
    c.beginPath(); c.moveTo(x - rx + 1, y + 1); c.quadraticCurveTo(x, y - 5, x + rx - 1, y + 1);
    c.strokeStyle = PLUM; c.lineWidth = 2.3; c.stroke();
    return;
  }
  oval(c, x, y, rx, ry, '#fffaf0', PLUM, 1.6);
  const px = x + look * 1.25, py = y - 1.2;
  oval(c, px, py, 3.8, 5, '#633b3e');
  oval(c, px, py, 2.65, 4, PLUM);
  oval(c, px - 1.05, py - 1.9, 1.15, 1.45, '#fffaf0');
  oval(c, px + 1.2, py + 2.2, .5, .65, '#ffdfad');
}

export function drawDog(c, x, y, { dark = false, phase = 'draw', age = 0, resultAt = 0, reduced = false, look = -1, hit = null } = {}) {
  const win = phase === 'win', fail = phase === 'fail', run = phase === 'run';
  const time = reduced ? 0 : age;
  const lift = win && !reduced ? Math.abs(Math.sin(resultAt * 10)) * (1 - clamp(resultAt / 1.13, 0, 1)) * 14 : 0;
  const bend = fail && !reduced ? Math.sin(clamp(resultAt * 4, 0, 1) * Math.PI / 2) * Math.exp(-resultAt * 2.6) : 0;
  const breath = reduced || win || fail ? 0 : Math.sin(time * 3.3) * .018;
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
  oval(c, 2, 28, 40, 10, dark ? '#373345' : '#dce2aa');
  oval(c, 1, 29, 29, 6, dark ? '#484254' : '#c8ce92');
  c.translate(fail ? (hit && hit.x > x ? -1 : 1) * bend * 7 : 0, -lift + bend * 4);
  c.rotate(bend * (hit && hit.x > x ? -.24 : .24));
  c.scale(1 + bend * .08 - breath, 1 - bend * .11 + breath);
  const trim = dark ? CREAM : '#fff9de';
  for (const part of [TAIL, BODY, RIGHT_EAR, HEAD, LEFT_EAR]) shape(c, part, null, trim, 6.9);
  shape(c, TAIL, '#cc764e', PLUM, 2.7);
  shape(c, 'M28 23q4-3 7-5q3 5-1 8Z', '#f9d2a1');
  shape(c, BODY, '#d08254', PLUM, 2.7);
  shape(c, 'M-9 18Q-14 24-11 29Q-6 32 7 31Q13 27 8 20Z', '#f9d3a1');
  shape(c, 'M-21 26q4-3 10-2q5 1 4 7q-6 3-12 1Z M9 29q1-6 9-5q5 1 4 6q-4 5-13 1Z', '#fff0c9', PLUM, 2.1);
  shape(c, 'M-16 29l1 2m4-2 1 2m24-2 1 2m3-2 1 1', null, '#a65c4c', 1.05);
  shape(c, 'M-17 16Q-1 22 17 16L16 22Q1 29-16 23Z', '#477d6e', PLUM, 2.25);
  oval(c, 3, 25, 3.35, 3.45, HONEY, PLUM, 1.25);
  oval(c, 2.5, 24, .87, .8, BUTTER);
  shape(c, RIGHT_EAR, '#a6533d', PLUM, 2.7);
  shape(c, 'M24-24q5 2 6 10q-4 3-7-4Z', '#e48d76');
  shape(c, HEAD, '#e9a065', PLUM, 2.85);
  shape(c, 'M-21-4Q-16-19-10-17Q-3-15-5-5Q-11 3-21 1Z', '#d7794d');
  shape(c, 'M-13-23q4-2 8-2m3 0 6-1', null, '#ffc487', 1.55);
  shape(c, LEFT_EAR, '#aa583e', PLUM, 2.7);
  shape(c, 'M-25-17q-6 4-7 14q1 3 3 3q1-8 5-12Z', '#df8a6a');
  if (fail) {
    shape(c, 'M-16-16l10-1m12 0 10 2M-17-10l9 3-8 4m33-8-10 4 9 4', null, PLUM, 2.25);
  } else {
    const blink = !reduced && !run && time > 1 && (time + .4) % 4.2 < .11;
    shape(c, run ? 'M-17-17q5-4 10-2m13 0q5-2 10 2' : 'M-15-17q5-3 9-2m12-1q5 0 9 4', null, '#8e493e', 1.65);
    eye(c, -10.7, -7.6, 6.75, 8.1, look, blink || win);
    eye(c, 9.5, -8, 7.25, 8.55, look, blink || win);
  }
  shape(c, MUZZLE, '#ffedc8', PLUM, 1.7);
  oval(c, -15.1, 8.1, 3.7, 2.25, '#efa889', null, 1, .12);
  oval(c, 16.9, 7.2, 3.65, 2.25, '#efa889', null, 1, -.14);
  for (const [px, py, r] of [[-12, 5, .9], [-10, 8.5, .66], [-14, 10, .62], [12, 4.6, .9], [13.3, 8.5, .67], [10.5, 10, .65]]) oval(c, px, py, r, r, '#a96152');
  if (fail) {
    oval(c, .5, 12.6, 4.1, 4.55, PLUM);
    oval(c, 1, 14.5, 2.3, 1.05, '#e38881');
  } else if (win) {
    shape(c, 'M-9 9q10 5 20-1q-1 9-8 10q-9 2-12-9Z', PLUM);
    shape(c, 'M-2 15q3-3 7-2q4 0 4 4q-1 4-5 4q-6 0-6-6Z', '#ee8c87', PLUM, 1.35);
    line(c, 4, 15, 4, 17, '#ad535f', .9);
  } else if (run) oval(c, 1, 13.4, 2.8, 2.15, '#8a5149', PLUM, 1.15);
  else shape(c, 'M0 7v4q-4 4-8 1m8-1q5 4 9-1', null, PLUM, 1.65);
  shape(c, 'M-6 .6Q-3-2 3-1Q10 0 8 4Q5 9 1 9Q-3 9-7 4Q-8 2-6 .6Z', PLUM);
  shape(c, 'M-4 2q3-1 6-.5', null, '#c09297', 1.3);
  c.restore();
}

function beeFigure(c, frame) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const lift = [0, 1.6, 2.8][frame];
  oval(c, -3.7, -3.8 + lift, 4.2, 2.55, '#edf9ef', PLUM, 1.1, .25);
  oval(c, .4, -5.5 + lift, 4.7, 2.7, '#fff9db', PLUM, 1.1, -.64 + lift * .17);
  shape(c, 'M-6 1l-3 1.5 3 .8M5-2l2-3m-.3.4 1.2.4', null, PLUM, 1.2);
  oval(c, -1.1, 1.2, 7.05, 4.35, HONEY, PLUM, 1.35, -.09);
  shape(c, 'M-5.4-1.9q1.5 2.5.4 6l2.1.7Q-1.6 1-3.2-2.8Z M-.7-3.2q2.4 3.3 1.2 8.1l1.8-.6q1.4-3.1-.6-7.3Z', PLUM);
  oval(c, 4, -.4, 1.05, 1.16, PLUM);
  oval(c, 4.27, -.7, .32, .36, '#ffeeac');
}

export function drawBee(c, bee, { age = 0, index = 0, reduced = false, toward = null } = {}) {
  const angle = Math.hypot(bee.vx, bee.vy) > 3 ? Math.atan2(bee.vy, bee.vx) :
    toward ? Math.atan2(toward[1] - bee.y, toward[0] - bee.x) * .45 : 0;
  const frame = reduced ? 1 : (Math.floor(age * 21) + index) % 3;
  if (!beeFrames) {
    const frames = Array.from({ length: 3 }, (_, i) => {
      const s = surface(c, 80, 72), p = s?.getContext('2d');
      if (!p) return null;
      p.translate(40, 36); p.scale(4, 4); beeFigure(p, i);
      return s;
    });
    if (frames.every(Boolean)) beeFrames = frames;
  }
  c.save(); c.translate(bee.x, bee.y);
  // Flip the insect rather than drawing wings underneath when flying west.
  if (Math.abs(angle) > Math.PI / 2) {
    c.rotate(angle > 0 ? angle - Math.PI : angle + Math.PI); c.scale(-1, 1);
  } else c.rotate(angle);
  if (beeFrames) c.drawImage(beeFrames[frame], -10, -9, 20, 18);
  else beeFigure(c, frame);
  c.restore();
}

function hintStroke(c, x, y, age, dark, reduced) {
  // First Buzz approaches from the upper left. This arch is a three-star route.
  const radius = 46;
  const progress = reduced ? 1 : clamp(((age + .28) % 3.1 - .12) / 1.7, 0, 1);
  const a = Math.PI - .16, endAngle = TAU + .16, b = a + progress * (endAngle - a);
  const color = dark ? '#b6a8cc' : '#856783';
  c.globalAlpha = .35;
  c.setLineDash([2, 5]); arc(c, x, y, radius, a, endAngle, color, 2.2); c.setLineDash([]);
  c.globalAlpha = .84;
  if (b > a) arc(c, x, y, radius, a, b, color, 5);
  c.globalAlpha = 1;
  const end = reduced ? a + (endAngle - a) * .45 : b;
  const px = x + Math.cos(end) * radius, py = y + Math.sin(end) * radius;
  oval(c, px, py, 4.1, 4.1, dark ? CREAM : '#fff9df', color, 1.65);
  c.save(); c.translate(px - 4, py + 1); c.rotate(-.34);
  shape(c, 'M2 16V3Q2-1 5-1Q8-1 8 3V10Q12 7 14 12Q18 10 20 14Q25 14 25 18V23Q25 29 21 32H10Q7 28 3 24L-2 19Q-4 16-2 14Q0 13 2 16Z', '#fff2c9', PLUM, 1.85);
  shape(c, 'M8 10v5m6-3v4m6-2v4', null, '#a47877', 1.2);
  c.restore();
}

function timer(c, x, y, time, dark, complete, danger, target) {
  const top = -Math.PI / 2, radius = 40;
  const track = dark ? '#51445f' : '#dfd1a7';
  const border = dark ? '#f6e8b9' : '#fff8dd';
  arc(c, x, y, radius, 0, TAU, border, 7.2);
  arc(c, x, y, radius, 0, TAU, track, 4.15);
  const end = top + TAU * (complete ? 1 : clamp(time / HOLD, 0, 1));
  if (end > top) arc(c, x, y, radius, top, end, complete ? GRASS : '#cc8a1b', 4.15);
  for (let i = 0; i < 5; i++) {
    const a = top + TAU * i / 5;
    const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius;
    oval(c, x + cx, y + cy, 1.45, 1.45, dark ? CREAM : PLUM);
  }
  if (danger > 0 && !complete && target) {
    const toward = Math.atan2(target.y - y, target.x - x);
    c.globalAlpha = .45 + danger * .45;
    arc(c, x, y, radius + 6, toward - .32, toward + .32, dark ? '#ffa395' : '#a94d50', 2.3);
    c.globalAlpha = 1;
  }
}

function star(c, x, y, r, fill, stroke, lean = 0) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + Math.PI * i / 5 + lean, d = i % 2 ? r * .46 : r;
    if (i) c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath(); c.fillStyle = fill; c.fill();
  c.strokeStyle = stroke; c.lineWidth = 1.35; c.stroke();
}

function celebration(c, x, y, stars, time, dark, reduced) {
  const top = y - 58;
  for (let i = 0; i < stars; i++) {
    const offset = i - (stars - 1) / 2;
    const r = (offset === 0 ? 8.5 : 6.6) * (reduced ? 1 : .62 + .38 * clamp(time * 7 - i * .45, 0, 1));
    star(c, x + offset * 19, top + Math.abs(offset) * 5, r, HONEY, dark ? CREAM : PLUM, offset * .17);
  }
  if (reduced || time >= 1.4) return;
  const colors = [HONEY, GRASS, '#df786e', '#aa82a9'];
  c.globalAlpha = clamp((1.4 - time) * 1.7, 0, 1);
  for (let i = 0; i < 13; i++) {
    const a = i * 2.399 + .8, spread = 28 + time * (26 + (i % 5) * 12);
    const px = x + Math.cos(a) * spread, py = y + Math.sin(a) * spread + time * time * 27;
    if (i % 4 === 0) star(c, px, py, 4, colors[i % 4], dark ? CREAM : PLUM, a + time * 2);
    else line(c, px, py, px + Math.cos(a + time * 3) * 5, py + Math.sin(a + time * 3) * 5, colors[i % 4], 2.7);
  }
  c.globalAlpha = 1;
}

function sting(c, hit, time, dark, reduced) {
  const color = dark ? '#ffb293' : '#9c3451';
  const { x, y } = hit;
  if (!reduced && time < .55) {
    const radius = 10 + time * 34;
    c.globalAlpha = 1 - time / .55;
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7;
      const dx = Math.cos(a), dy = Math.sin(a);
      line(c, x + dx * radius, y + dy * radius, x + dx * (radius + 6), y + dy * (radius + 6), color, 2.7);
    }
    c.globalAlpha = 1;
  }
  // A persistent open reticle leaves the actual bee visible inside the mark.
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + .25;
    arc(c, x, y, 11.5, a, a + 1.05, dark ? NIGHT : '#fff5d7', 4.4);
    arc(c, x, y, 11.5, a, a + 1.05, color, 2.45);
  }
}

export function drawBoard(c, game, { dark = false, reduced = false, at = 0, hint = false, resultAt = 0 } = {}) {
  const { level, phase, points, hives, hit } = game;
  let bees = game.bees;
  if (reduced && phase === 'draw') {
    // Idle orbits are decorative. Use the real engine flight positions after release.
    if (!restingSwarms.has(game)) restingSwarms.set(game, bees.map(({ x, y, vx, vy }) => ({ x, y, vx, vy })));
    bees = restingSwarms.get(game);
  } else restingSwarms.delete(game);
  const world = clamp(level.world | 0, 0, 3);
  const [x, y] = level.dog;
  const age = game.age ?? at;
  const win = phase === 'win', fail = phase === 'fail', run = phase === 'run';
  let near = Infinity, target = null;
  for (const bee of bees) {
    const distance = (bee.x - x) ** 2 + (bee.y - y) ** 2;
    if (distance < near) { near = distance; target = bee; }
  }
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  boardBackground(c, world, dark);
  if (run || win) timer(c, x, y, game.time, dark, win, clamp((90 - Math.sqrt(near)) / 65, 0, 1), target);
  for (const item of level.walls) wall(c, item, dark, world);
  for (const hive of hives) drawHive(c, hive.x, hive.y, { dark, alert: run });
  ink(c, points, dark, game.drawing);
  drawDog(c, x, y, { dark, phase, age, resultAt, reduced, look: target ? clamp((target.x - x) / 22, -1, 1) : -1, hit });
  for (let i = 0; i < bees.length; i++) drawBee(c, bees[i], { age, index: i, reduced: reduced || fail || win, toward: level.dog });
  if (hint && level.id === 1 && phase === 'draw' && !game.drawing && !points.length) hintStroke(c, x, y, age, dark, reduced);
  if (fail && hit) sting(c, hit, resultAt, dark, reduced);
  if (win) celebration(c, x, y, game.stars, resultAt, dark, reduced);
  c.restore();
}
