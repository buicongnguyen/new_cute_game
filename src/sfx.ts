/**
 * Every sound is synthesised with Web Audio (no files to download): bells for the mallet, pops for freeing, a low
 * hum for Bao, and a soft pentatonic music box. One AudioContext, unlocked by the first gesture; buses for sound
 * and music under a compressor; small pitch variance so repeats don't grate.
 */
type Voice = (ctx: AudioContext, out: AudioNode, at: number, pitch: number) => void;

let ctx: AudioContext | null = null;
let sfxBus: GainNode, musicBus: GainNode, master: GainNode;
let volume = { sfx: .8, music: .45 };
const VOL_KEY = 'cloudback:audio';
try { const v = JSON.parse(localStorage.getItem(VOL_KEY) ?? 'null'); if (v) volume = { ...volume, ...v }; } catch { /* defaults */ }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = 'ambient'; } catch { /* not iOS */ }
    const comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); master.gain.value = .9;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain(); musicBus = ctx.createGain();
    sfxBus.connect(master); musicBus.connect(master);
    applyVolume();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
function applyVolume() { if (!ctx) return; sfxBus.gain.setTargetAtTime(volume.sfx, ctx.currentTime, .05); musicBus.gain.setTargetAtTime(volume.music * .5, ctx.currentTime, .2); }
export const getVolume = () => ({ ...volume });
export function setVolume(kind: 'sfx' | 'music', v: number) { volume[kind] = Math.max(0, Math.min(1, v)); applyVolume(); try { localStorage.setItem(VOL_KEY, JSON.stringify(volume)); } catch { /* session */ } }

function tone(c: AudioContext, out: AudioNode, at: number, freq: number, dur: number, type: OscillatorType = 'sine', gain = .3, to?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + .006); g.gain.exponentialRampToValueAtTime(.0008, at + dur);
  o.connect(g).connect(out); o.start(at); o.stop(at + dur + .02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext, out: AudioNode, at: number, dur: number, freq: number, q = 1, gain = .25, to?: number) {
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, at); if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur); f.Q.value = q;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + .01); g.gain.exponentialRampToValueAtTime(.0008, at + dur);
  src.connect(f).connect(g).connect(out); src.start(at); src.stop(at + dur + .02);
}
const bell = (c: AudioContext, o: AudioNode, at: number, f: number, g = .22, d = .5) => { tone(c, o, at, f, d, 'sine', g); tone(c, o, at, f * 2.76, d * .5, 'sine', g * .35); tone(c, o, at, f * 5.4, d * .25, 'sine', g * .12); };

const VOICES: Record<string, Voice> = {
  swing: (c, o, at, p) => noise(c, o, at, .12, 900 * p, 1.4, .12, 2600 * p),
  ring: (c, o, at, p) => { bell(c, o, at, 1046 * p, .2, .35); },
  chime: (c, o, at, p) => bell(c, o, at, 1318 * p, .22, .6),
  free: (c, o, at, p) => { tone(c, o, at, 420 * p, .12, 'triangle', .25, 900 * p); [1318, 1568, 2093].forEach((f, i) => bell(c, o, at + .05 + i * .06, f * p, .12, .4)); },
  notice: (c, o, at, p) => tone(c, o, at, 660 * p, .1, 'square', .05, 990 * p),
  bump: (c, o, at, p) => tone(c, o, at, 180 * p, .14, 'sine', .25, 90 * p),
  spit: (c, o, at, p) => noise(c, o, at, .15, 2400 * p, 3, .12),
  charge: (c, o, at, p) => noise(c, o, at, .5, 200 * p, .8, .2, 90 * p),
  dive: (c, o, at, p) => tone(c, o, at, 1400 * p, .3, 'sine', .08, 400 * p),
  hurt: (c, o, at, p) => tone(c, o, at, 300 * p, .18, 'triangle', .22, 150 * p),
  hop: (c, o, at, p) => tone(c, o, at, 300 * p, .16, 'sine', .18, 620 * p),
  spin: (c, o, at, p) => { noise(c, o, at, .35, 500 * p, 1.2, .14, 2200 * p); bell(c, o, at + .1, 880 * p, .12, .4); },
  harvest: (c, o, at, p) => { tone(c, o, at, 520 * p, .08, 'sine', .2, 780 * p); tone(c, o, at + .07, 780 * p, .12, 'sine', .16); },
  feed: (c, o, at, p) => { noise(c, o, at, .1, 700 * p, 2, .14); noise(c, o, at + .12, .1, 600 * p, 2, .12); tone(c, o, at + .25, 160 * p, .5, 'sine', .25, 210 * p); },
  hum: (c, o, at, p) => { tone(c, o, at, 130 * p, 1.1, 'sine', .25, 175 * p); tone(c, o, at + .1, 196 * p, .9, 'sine', .1, 262 * p); },
  grow: (c, o, at, p) => { [523, 659, 784, 1046, 1318].forEach((f, i) => bell(c, o, at + i * .12, f * p, .16, .8)); tone(c, o, at, 98, 2, 'sine', .25, 147); },
  song: (c, o, at, p) => { tone(c, o, at, 220 * p, 2.2, 'sine', .2, 330 * p); tone(c, o, at + .3, 277 * p, 2, 'sine', .14, 415 * p); tone(c, o, at + .6, 330 * p, 1.8, 'sine', .12, 494 * p); },
  shield: (c, o, at, p) => { noise(c, o, at, .6, 3000 * p, .6, .2); [1568, 2093, 2637].forEach((f, i) => bell(c, o, at + i * .05, f * p, .1, .5)); },
  glance: (c, o, at, p) => tone(c, o, at, 220 * p, .25, 'triangle', .14),
  windup: (c, o, at, p) => tone(c, o, at, 200 * p, .6, 'sawtooth', .04, 420 * p),
  slam: (c, o, at, p) => { tone(c, o, at, 110 * p, .5, 'sine', .4, 40 * p); noise(c, o, at, .3, 300, .7, .2); },
  blast: (c, o, at, p) => noise(c, o, at, .4, 800 * p, .9, .16, 300 * p),
  splash: (c, o, at, p) => noise(c, o, at, .3, 1800 * p, 1, .12, 600 * p),
  bite: (c, o, at, p) => { tone(c, o, at, 880 * p, .06, 'sine', .2); tone(c, o, at + .08, 1320 * p, .08, 'sine', .2); },
  catch: (c, o, at, p) => [784, 988, 1175, 1568].forEach((f, i) => bell(c, o, at + i * .07, f * p, .13, .5)),
  miss: (c, o, at, p) => tone(c, o, at, 392 * p, .3, 'triangle', .12, 262 * p),
  click: (c, o, at, p) => tone(c, o, at, 1200 * p, .04, 'sine', .08),
  coin: (c, o, at, p) => { bell(c, o, at, 1568 * p, .1, .25); bell(c, o, at + .06, 2093 * p, .08, .3); },
  raid: (c, o, at, p) => { tone(c, o, at, 220 * p, .5, 'sawtooth', .07, 196 * p); tone(c, o, at + .5, 220 * p, .5, 'sawtooth', .07, 196 * p); },
  faint: (c, o, at, p) => [523, 440, 349, 262].forEach((f, i) => tone(c, o, at + i * .12, f * p, .3, 'triangle', .14)),
  level: (c, o, at, p) => [523, 659, 784, 1046].forEach((f, i) => bell(c, o, at + i * .09, f * p, .16, .7)),
  sail: (c, o, at, p) => { noise(c, o, at, 1.6, 400 * p, .5, .1, 900 * p); tone(c, o, at, 147 * p, 1.4, 'sine', .14, 196 * p); },
  arrive: (c, o, at, p) => [392, 494, 587].forEach((f, i) => bell(c, o, at + i * .1, f * p, .14, 1)),
  dew: (c, o, at, p) => bell(c, o, at, 1760 * p, .1, .5),
  brush: (c, o, at, p) => noise(c, o, at, .2, 3000 * p, 1.5, .1),
  gong: (c, o, at, p) => { tone(c, o, at, 98 * p, 2.6, 'sine', .35); tone(c, o, at, 196 * p, 2.2, 'sine', .22); bell(c, o, at, 392 * p, .16, 2); noise(c, o, at, .4, 600 * p, .7, .12); },
};
const last = new Map<string, number>();
export function play(name: string, pitchJitter = .05) {
  if (!ctx || ctx.state !== 'running' || volume.sfx <= 0) return;
  const v = VOICES[name]; if (!v) return;
  const now = ctx.currentTime, prev = last.get(name) ?? -1;
  if (now - prev < .035) return; // voice cap: one per 35 ms per sound
  last.set(name, now);
  v(ctx, sfxBus, now + .005, 1 + (Math.random() * 2 - 1) * pitchJitter);
}

// ---------------------------------------------------------------- music box
const SCALES = { calm: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3], gloom: [220, 246.9, 261.6, 329.6, 349.2, 440, 493.9, 523.3], night: [196, 233.1, 261.6, 293.7, 349.2, 392, 466.2, 523.3] };
let mood: keyof typeof SCALES = 'calm', musicTimer: number | null = null, step = 0;
export function setMusic(next: keyof typeof SCALES) { mood = next; }
export function startMusic() {
  if (musicTimer !== null) return;
  musicTimer = window.setInterval(() => {
    if (!ctx || ctx.state !== 'running' || volume.music <= 0 || document.hidden) return;
    const scale = SCALES[mood], at = ctx.currentTime + .02;
    const pattern = [0, 2, 4, 5, 4, 2, 3, 1];
    const n = scale[(pattern[step % pattern.length] + (Math.floor(step / 8) % 2 ? 2 : 0)) % scale.length];
    tone(ctx, musicBus, at, n, 1.6, 'sine', .12);
    tone(ctx, musicBus, at, n * 2, .6, 'sine', .03);
    if (step % 4 === 0) tone(ctx, musicBus, at, scale[0] / 2, 2.6, 'triangle', .07);
    step++;
  }, 620);
}
