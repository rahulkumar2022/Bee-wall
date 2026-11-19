// Original synth voices. No assets and no scheduling timers: Web Audio clocks every voice.
const unit = n => Math.max(0, Math.min(1, Number(n) || 0));
const TAU = Math.PI * 2;
const hz = note => 440 * 2 ** ((note - 69) / 12);
const SAMPLE_RATE = 22050;

function makeMusic(audio) {
  const beat = .49, bar = beat * 4;
  const melody = [
    [69, 0, 72, 74, 72, 0, 67, 0], [65, 0, 69, 72, 69, 0, 64, 0],
    [65, 0, 70, 72, 70, 69, 65, 0], [67, 0, 69, 0, 72, 0, 64, 0],
    [69, 0, 72, 77, 76, 72, 69, 0], [65, 0, 69, 72, 74, 0, 72, 0],
    [70, 0, 74, 77, 74, 0, 69, 0], [67, 0, 64, 0, 67, 0, 0, 0],
  ];
  const chords = [[41, 53, 57, 60], [38, 50, 53, 57], [46, 53, 58, 62], [36, 48, 52, 55]];
  const buffer = audio.createBuffer(1, Math.round(SAMPLE_RATE * bar * melody.length), SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  // A muted thumb piano over soft wood-bass plucks; exact loop, with tails wrapping.
  function pluck(note, start, gain, decay, bright) {
    const origin = Math.round(start * SAMPLE_RATE), count = Math.round(SAMPLE_RATE * .76);
    const w = TAU * hz(note);
    for (let i = 0; i < count; i++) {
      const t = i / SAMPLE_RATE, a = w * t;
      const env = Math.min(1, t * 270) * Math.exp(-t * decay) * Math.min(1, (.76 - t) * 24);
      samples[(origin + i) % samples.length] += gain * env * (
        Math.sin(a) + Math.sin(a * 2.001) * .24 * bright +
        Math.sin(a * 3.004) * .12 * bright * Math.exp(-t * 8)
      );
    }
  }
  for (let i = 0; i < melody.length; i++) {
    const start = i * bar, [bass, low, mid, high] = chords[i % 4];
    pluck(bass, start, .105, 6.2, .5);
    pluck(bass + 12, start + beat * 2.5, .060, 8, .5);
    pluck(low, start + beat * .49, .055, 8, .7);
    pluck(mid, start + beat * 1.5, .046, 8, .8);
    pluck(high, start + beat * 3.5, .046, 8, .8);
    melody[i].forEach((note, j) => {
      if (note) pluck(note, start + j * beat * .5 + (j % 2 ? .017 : 0), j % 2 ? .108 : .16, 8.9, 1);
    });
  }
  return buffer;
}

function makeGrain(audio) {
  const grain = audio.createBuffer(1, Math.round(SAMPLE_RATE * .31), SAMPLE_RATE);
  const samples = grain.getChannelData(0);
  let seed = 1011, last = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    last = .78 * last + .22 * white;
    samples[i] = last * (.68 + .32 * Math.cos(i * TAU * 13 / samples.length));
  }
  return grain;
}

const CUES = Object.freeze({
  // [delay, duration, start Hz, end Hz, weight, wave]
  tap: [[0, .06, 605, 430, .062, 'sine']],
  release: [[0, .14, 250, 630, .084, 'triangle'], [.06, .16, 740, 970, .041, 'sine']],
  win: [[0, .23, hz(65), hz(65), .086, 'triangle'], [.095, .25, hz(69), hz(69), .082, 'triangle'],
    [.19, .28, hz(72), hz(72), .076, 'triangle'], [.30, .42, hz(77), hz(77), .081, 'triangle'],
    [.33, .36, hz(84), hz(84), .027, 'sine']],
  fail: [[0, .29, 294, 106, .106, 'triangle'], [.085, .28, 202, 71, .081, 'triangle'],
    [.27, .17, 150, 94, .049, 'sine']],
});

function stop(source) {
  try { source.stop(); } catch { /* an already-finished voice */ }
  source.disconnect();
}

export function createSound() {
  const settings = { allowed: false, paused: false, sfx: true, music: false };
  let state = { phase: 'idle', drawing: false, speed: 0, danger: 0 };
  let audio, sfxBus, musicBus, sfxOn = false, musicOn = false;
  let buzz, scratch, music, musicBuffer, grainBuffer;
  let musicStart = 0, musicOffset = 0, enableRequested = false;
  const transients = new Set();

  function gate(node, enabled, now, volume) {
    const { gain } = node;
    gain.cancelScheduledValues(now);
    if (enabled) gain.setTargetAtTime(volume, now, .012);
    else gain.setValueAtTime(0, now);
  }

  function startBuzz(now) {
    const carrier = audio.createOscillator(), flutter = audio.createOscillator();
    const filter = audio.createBiquadFilter(), tremolo = audio.createGain();
    const depth = audio.createGain(), volume = audio.createGain();
    carrier.type = 'sawtooth'; carrier.frequency.value = 105;
    flutter.frequency.value = 22; tremolo.gain.value = .72; depth.gain.value = .26;
    filter.type = 'lowpass'; filter.Q.value = .65; volume.gain.value = 0;
    flutter.connect(depth).connect(tremolo.gain);
    carrier.connect(filter).connect(tremolo).connect(volume).connect(sfxBus);
    carrier.start(now); flutter.start(now);
    return { carrier, flutter, filter, volume, tremolo, depth, last: -1 };
  }

  function startScratch(now) {
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter();
    const volume = audio.createGain();
    source.buffer = grainBuffer ??= makeGrain(audio);
    source.loop = true; filter.type = 'bandpass'; filter.Q.value = .72;
    volume.gain.value = 0;
    source.connect(filter).connect(volume).connect(sfxBus);
    source.start(now);
    return { source, filter, volume, last: -1 };
  }

  function stopBuzz() {
    if (!buzz) return;
    stop(buzz.carrier); stop(buzz.flutter);
    buzz.filter.disconnect(); buzz.depth.disconnect(); buzz.tremolo.disconnect(); buzz.volume.disconnect();
    buzz = null;
  }

  function stopScratch() {
    if (!scratch) return;
    stop(scratch.source); scratch.filter.disconnect(); scratch.volume.disconnect();
    scratch = null;
  }

  function stopEffects() {
    stopBuzz(); stopScratch();
    for (const voice of transients) { stop(voice.source); voice.volume.disconnect(); }
    transients.clear();
  }

  function sync() {
    if (!audio || !enableRequested) return;
    const now = audio.currentTime, enabled = settings.allowed && !settings.paused;
    const wantsSfx = enabled && settings.sfx, wantsMusic = enabled && settings.music;
    if (sfxOn !== wantsSfx) {
      sfxOn = wantsSfx;
      gate(sfxBus, sfxOn, now, .84);
      if (!sfxOn) stopEffects();
    }
    if (musicOn !== wantsMusic) {
      musicOn = wantsMusic;
      gate(musicBus, musicOn, now, .23);
      if (musicOn) {
        music = audio.createBufferSource();
        music.buffer = musicBuffer ??= makeMusic(audio);
        music.loop = true; music.connect(musicBus);
        musicStart = audio.currentTime;
        music.start(musicStart, musicOffset);
      } else if (music) {
        musicOffset = (musicOffset + now - musicStart) % musicBuffer.duration;
        stop(music); music = null;
      }
    }
    if (!sfxOn) return;
    if (state.phase === 'run') {
      buzz ??= startBuzz(now);
      const danger = unit(state.danger);
      if (Math.abs(danger - buzz.last) > .006) {
        buzz.last = danger;
        buzz.carrier.frequency.setTargetAtTime(104 + danger * 96, now, .055);
        buzz.flutter.frequency.setTargetAtTime(22 + danger * 14, now, .07);
        buzz.filter.frequency.setTargetAtTime(350 + danger * 680, now, .06);
        buzz.volume.gain.setTargetAtTime(.025 + danger * .055, now, .045);
      }
    } else stopBuzz();
    if (state.phase === 'draw' && state.drawing) {
      // The board reports stroke speed in logical pixels per second.
      const speed = Math.sqrt(unit((state.speed - 8) / 680));
      if (speed > 0) scratch ??= startScratch(now);
      if (scratch && (speed === 0 || Math.abs(speed - scratch.last) > .008) && speed !== scratch.last) {
        scratch.last = speed;
        scratch.filter.frequency.setTargetAtTime(850 + speed * 1450, now, .025);
        scratch.source.playbackRate.setTargetAtTime(.82 + speed * .9, now, .026);
        scratch.volume.gain.setTargetAtTime(speed * .25, now, .02);
      }
    } else stopScratch();
  }

  function unlock() {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return Promise.resolve(false);
    try {
      if (!audio || audio.state === 'closed') {
        audio = new Context();
        sfxBus = audio.createGain(); musicBus = audio.createGain();
        sfxBus.gain.value = 0; musicBus.gain.value = 0;
        sfxBus.connect(audio.destination); musicBus.connect(audio.destination);
        sfxOn = musicOn = false;
        buzz = scratch = music = null;
        transients.clear();
      }
      // Calling resume synchronously here preserves Safari's user-gesture context.
      const context = audio;
      const resume = context.state === 'running' ? null : context.resume();
      enableRequested = true;
      sync();
      return Promise.resolve(resume).then(() => context.state === 'running', () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function set({ allowed = settings.allowed, paused = settings.paused, sfx = settings.sfx, music = settings.music } = {}) {
    if (allowed === settings.allowed && paused === settings.paused && sfx === settings.sfx && music === settings.music) return;
    Object.assign(settings, { allowed, paused, sfx, music });
    sync();
  }

  function update({ phase = 'idle', drawing = false, speed = 0, danger = 0 } = {}) {
    if (phase === state.phase && drawing === state.drawing && speed === state.speed && danger === state.danger) return;
    state = { phase, drawing, speed, danger };
    sync();
  }

  function cue(kind) {
    if (!sfxOn || !Object.prototype.hasOwnProperty.call(CUES, kind)) return;
    const base = audio.currentTime + .004;
    for (const [delay, duration, first, last, gain, type] of CUES[kind]) {
      const source = audio.createOscillator(), volume = audio.createGain();
      const start = base + delay, end = start + duration;
      source.type = type;
      source.frequency.setValueAtTime(first, start);
      if (last !== first) source.frequency.exponentialRampToValueAtTime(last, end);
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(gain, start + .012);
      volume.gain.exponentialRampToValueAtTime(.0001, end);
      source.connect(volume).connect(sfxBus);
      const voice = { source, volume };
      transients.add(voice);
      source.onended = () => { source.disconnect(); volume.disconnect(); transients.delete(voice); };
      source.start(start); source.stop(end + .005);
    }
  }

  return { unlock, set, update, cue };
}
