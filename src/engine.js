export const W = 360;
export const H = 640;
export const HOLD = 5;
const HZ = 60;
export const DT = 1 / HZ;
export const DOG_R = 24;
export const STROKE_R = 4;
export const FIXED_WALL_R = 6;
export const HIVE_R = 19;
export const BEE_R = 5;

const MIN_STEP = 4;
const MIN_STROKE = 12;
const EPS = 1e-7;
const TAU = Math.PI * 2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(((x - ax) * dx + (y - ay) * dy) / length2, 0, 1) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

export function starRating(remaining, budget) {
  if (budget <= 0) return 1;
  return remaining >= budget * 0.5 ? 3 : remaining >= budget * 0.2 ? 2 : 1;
}

function seeded(seed) {
  let state = (seed | 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

// Fraction along a displacement at first contact with a circle, or Infinity.
function circleTime(px, py, dx, dy, r) {
  const c = px * px + py * py - r * r;
  if (c <= 0) return 0;
  const b = px * dx + py * dy;
  if (b >= 0) return Infinity;
  const a = dx * dx + dy * dy;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  const t = c / (-b + Math.sqrt(discriminant));
  return t <= 1 ? t : Infinity;
}

function segment(ax, ay, bx, by, radius) {
  const length = Math.hypot(bx - ax, by - ay);
  const r = radius + BEE_R;
  const ux = length ? (bx - ax) / length : 1;
  const uy = length ? (by - ay) / length : 0;
  return { ax, ay, bx, by, ux, uy, length, r,
    left: Math.min(ax, bx) - r, right: Math.max(ax, bx) + r,
    top: Math.min(ay, by) - r, bottom: Math.max(ay, by) + r };
}

const BOUNDS = [segment(0, 0, W, 0, 0), segment(W, 0, W, H, 0),
  segment(W, H, 0, H, 0), segment(0, H, 0, 0, 0)];

// A solid line is a capsule: two parallel sides and two circular end caps.
function firstWall(x, y, dx, dy, walls) {
  const loX = Math.min(x, x + dx), hiX = Math.max(x, x + dx);
  const loY = Math.min(y, y + dy), hiY = Math.max(y, y + dy);
  let best = Infinity, nx = 0, ny = 0;
  for (const wall of walls) {
    if (hiX < wall.left - EPS || loX > wall.right + EPS || hiY < wall.top - EPS || loY > wall.bottom + EPS) continue;
    const { ax, ay, bx, by, ux, uy, length, r } = wall;
    const normalStep = -uy * dx + ux * dy;
    if (Math.abs(normalStep) > EPS) {
      const side = normalStep < 0 ? 1 : -1;
      const gap = side * (-uy * (x - ax) + ux * (y - ay)) - r;
      if (gap >= -EPS) {
        const t = Math.max(0, gap / Math.abs(normalStep));
        if (t <= 1 && t < best) {
          const along = ux * (x + dx * t - ax) + uy * (y + dy * t - ay);
          if (along >= 0 && along <= length) {
            best = t;
            nx = -uy * side;
            ny = ux * side;
          }
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      const px = x - (i === 0 ? ax : bx);
      const py = y - (i === 0 ? ay : by);
      const t = circleTime(px, py, dx, dy, r);
      if (t >= best) continue;
      const rx = px + dx * t, ry = py + dy * t;
      const distance = Math.hypot(rx, ry);
      if (distance > EPS && (rx * dx + ry * dy) / distance < -EPS) {
        best = t;
        nx = rx / distance;
        ny = ry / distance;
      }
    }
  }
  return best === Infinity ? null : { t: best, nx, ny };
}

// Waypoints include the hive's authored start. A period is one out-and-back.
function hiveRoute({ x, y, path, period = 4 }) {
  if (!path?.length || period <= 0) return null;
  const legs = [];
  let length = 0;
  for (const [nextX, nextY] of path) {
    const dx = nextX - x, dy = nextY - y;
    const span = Math.hypot(dx, dy);
    if (span) legs.push({ x, y, dx, dy, offset: length, span });
    length += span;
    x = nextX;
    y = nextY;
  }
  return length ? { legs, length, period } : null;
}

export class Game {
  #ticks = 0;
  #runTicks = 0;
  #flight = [];
  #walls;
  #routes;

  constructor(level, { assist = false } = {}) {
    this.level = level;
    this.assist = assist;
    this.phase = 'draw';
    this.points = [];
    this.budget = this.ink = level.ink * (assist ? 1.5 : 1);
    this.bees = [];
    this.hives = level.hives.map(({ x, y }) => ({ x, y }));
    this.time = 0;
    this.age = 0;
    this.drawing = false;
    this.hit = null;
    this.stars = 0;
    this.#walls = [...BOUNDS, ...level.walls.map(wall => segment(...wall, FIXED_WALL_R))];
    this.#routes = level.hives.map(hiveRoute);
    const random = seeded(level.seed ?? Math.imul(level.id ?? 1, 0x9e3779b9));
    const speed = (level.speed ?? 84) * (assist ? 0.75 : 1);
    for (const [hiveIndex, hive] of level.hives.entries()) {
      const stagger = hive.release ?? (this.#routes[hiveIndex] ? 1 : 0.3);
      for (let i = 0; i < hive.n; i++) {
        this.#flight.push({
          hiveIndex,
          launch: Math.ceil(i * stagger * HZ / Math.max(1, hive.n - 1)),
          angle: TAU * (i + 0.23 * random()) / hive.n,
          orbit: 16 + 13 * random(), spin: 1.7 + 1.4 * random(),
          speed: speed * (0.9 + 0.2 * random()),
          wobble: 4.5 + 3.5 * random(), steer: (random() - 0.5) * 0.26,
          scrape: 0, scrapeX: 0, scrapeY: 0,
        });
        this.bees.push({ x: hive.x, y: hive.y, vx: 0, vy: 0, active: false });
      }
    }
    this.#idle(0);
  }

  begin(x, y) {
    if (this.phase !== 'draw' || this.drawing || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = clamp(x, 0, W);
    y = clamp(y, 0, H);
    if (Math.hypot(x - this.level.dog[0], y - this.level.dog[1]) <= DOG_R + STROKE_R ||
        this.hives.some(hive => Math.hypot(x - hive.x, y - hive.y) <= HIVE_R) ||
        this.level.walls.some(wall => distanceToSegment(x, y, ...wall) <= FIXED_WALL_R)) return false;
    this.points = [{ x, y }];
    this.drawing = true;
    return true;
  }

  move(x, y) {
    if (!this.drawing || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const a = this.points[this.points.length - 1];
    const dx = clamp(x, 0, W) - a.x;
    const dy = clamp(y, 0, H) - a.y;
    const length = Math.hypot(dx, dy);
    if (!length || (length < MIN_STEP && length + EPS < this.ink)) return false;
    const fraction = Math.min(1, this.ink / length);
    const b = { x: a.x + dx * fraction, y: a.y + dy * fraction };
    if (distanceToSegment(...this.level.dog, a.x, a.y, b.x, b.y) <= DOG_R + STROKE_R) return false;
    this.points.push(b);
    this.ink = Math.max(0, this.ink - length);
    if (this.ink < EPS) {
      this.ink = 0;
      this.end();
    }
    return true;
  }

  end() {
    if (!this.drawing) return false;
    if (this.budget - this.ink + EPS < MIN_STROKE) {
      this.cancel();
      return false;
    }
    this.drawing = false;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1], b = this.points[i];
      this.#walls.push(segment(a.x, a.y, b.x, b.y, STROKE_R));
    }
    this.phase = 'run';
    this.#idle(0);
    return true;
  }

  cancel() {
    if (this.phase !== 'draw' || !this.drawing) return false;
    this.drawing = false;
    this.points = [];
    this.ink = this.budget;
    return true;
  }

  tick() {
    this.age = ++this.#ticks / HZ;
    if (this.phase === 'draw') this.#idle(this.age);
    if (this.phase !== 'run') return;
    this.time = ++this.#runTicks / HZ;
    this.#advanceHives();
    this.#advanceBees();
    if (this.phase === 'fail') return;
    if (this.#runTicks === HOLD * HZ) {
      this.phase = 'win';
      this.stars = starRating(this.ink, this.budget);
    }
  }

  #orbit(bee, flight, time) {
    const hive = this.hives[flight.hiveIndex];
    const angle = flight.angle + flight.spin * time;
    bee.x = clamp(hive.x + Math.cos(angle) * flight.orbit, BEE_R, W - BEE_R);
    bee.y = clamp(hive.y + Math.sin(angle) * flight.orbit, BEE_R, H - BEE_R);
  }

  #idle(time) {
    this.bees.forEach((bee, i) => this.#orbit(bee, this.#flight[i], time));
  }

  #advanceHives() {
    for (let i = 0; i < this.#routes.length; i++) {
      const route = this.#routes[i];
      if (!route) continue;
      const cycle = (this.time % route.period) / route.period;
      const distance = (1 - Math.abs(2 * cycle - 1)) * route.length;
      const leg = route.legs.find(leg => distance <= leg.offset + leg.span) ?? route.legs[route.legs.length - 1];
      const ratio = clamp((distance - leg.offset) / leg.span, 0, 1);
      this.hives[i].x = leg.x + leg.dx * ratio;
      this.hives[i].y = leg.y + leg.dy * ratio;
    }
  }

  #advanceBees() {
    const [dogX, dogY] = this.level.dog;
    for (const [i, bee] of this.bees.entries()) {
      const flight = this.#flight[i];
      const launching = !bee.active;
      if (launching) {
        this.#orbit(bee, flight, this.time);
        if (this.#runTicks < flight.launch) continue;
        // Spawn on the hive's side of a nearby wall, not on the far side of the orbit.
        const hive = this.hives[flight.hiveIndex];
        const dx = bee.x - hive.x, dy = bee.y - hive.y;
        const wall = firstWall(hive.x, hive.y, dx, dy, this.#walls);
        if (wall) {
          bee.x = hive.x + dx * wall.t;
          bee.y = hive.y + dy * wall.t;
        }
        bee.active = true;
      }
      const angle = Math.atan2(dogY - bee.y, dogX - bee.x);
      const wobble = flight.steer + Math.sin(flight.angle + this.time * flight.wobble) * 0.24;
      // After briefly trying the direct route, follow the wall to look for an end.
      // A fixed preference per bee splits the swarm when it reaches a barrier.
      const search = Math.min(this.level.search ?? 0.58, Math.max(0, (flight.scrape - 0.14) * 2));
      const sx = Math.cos(angle + wobble) * (1 - search) + flight.scrapeX * search;
      const sy = Math.sin(angle + wobble) * (1 - search) + flight.scrapeY * search;
      const speed = flight.speed / (Math.hypot(sx, sy) || 1);
      const blend = launching ? 1 : 0.22;
      bee.vx += (sx * speed - bee.vx) * blend;
      bee.vy += (sy * speed - bee.vy) * blend;
      if (this.#travel(bee, flight, dogX, dogY)) return;
    }
  }

  #travel(bee, flight, dogX, dogY) {
    let dx = bee.vx * DT, dy = bee.vy * DT;
    let contact = null;
    // Resolve contacts in order, retaining tangential displacement and velocity.
    // Giving up the remainder at a complex corner is safe; advancing it blindly isn't.
    for (let iteration = 0; iteration < 4; iteration++) {
      const wall = firstWall(bee.x, bee.y, dx, dy, this.#walls);
      const dog = circleTime(bee.x - dogX, bee.y - dogY, dx, dy, DOG_R + BEE_R);
      const step = Math.min(1, dog, wall?.t ?? Infinity);
      bee.x += dx * step;
      bee.y += dy * step;
      if (dog === step) {
        this.hit = { x: bee.x, y: bee.y };
        this.phase = 'fail';
        return true;
      }
      if (!wall) break;
      contact = wall;
      const { nx, ny } = wall;
      const normal = Math.min(0, dx * nx + dy * ny);
      dx = (dx - normal * nx) * (1 - step);
      dy = (dy - normal * ny) * (1 - step);
      const velocity = Math.min(0, bee.vx * nx + bee.vy * ny);
      bee.vx -= velocity * nx;
      bee.vy -= velocity * ny;
      if (Math.abs(dx) + Math.abs(dy) < EPS) break;
    }
    if (contact) {
      let tx = -contact.ny, ty = contact.nx;
      const alignment = tx * flight.scrapeX + ty * flight.scrapeY;
      if ((flight.scrape > EPS && Math.abs(alignment) > EPS ? alignment : flight.steer) < 0) {
        tx = -tx;
        ty = -ty;
      }
      flight.scrapeX = tx;
      flight.scrapeY = ty;
      flight.scrape = Math.min(0.6, flight.scrape + DT);
    } else {
      flight.scrape = Math.max(0, flight.scrape - DT * 2);
    }
    return false;
  }
}
