/**
 * A small Web Audio mixer (references/audio-input-ui.md):
 * - one AudioContext, resumed by the first real gesture (pointerdown/keydown/touchend);
 * - voices → buses (music, sfx, ui) → master → compressor; gain changes ramp, never jump;
 * - fire-and-forget sources from decoded buffers, with ±5 % pitch and small gain variance,
 *   no immediate repeat of the same variant, and a voice cap per sound;
 * - sound on the same frame as the visual; duck ambience during big moments;
 * - on iPhone, the silent switch mutes Web Audio unless `navigator.audioSession.type` is set
 *   (choose 'playback' only if the game should play with the switch on);
 * - ship Opus with an AAC/MP3 fallback (full Opus support on iPhone only from iOS 18.4).
 */
import { pickVariant } from './feel.ts';

type Bus = 'music' | 'sfx' | 'ui';

export class AudioMixer {
  ctx: AudioContext | null = null;
  private buses = new Map<Bus, GainNode>();
  private voices = new Map<string, AudioBufferSourceNode[]>();
  private lastVariant = new Map<string, number>();

  /** Call from the first pointerdown/keydown handler (and again after visibility returns). */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const compressor = this.ctx.createDynamicsCompressor(), master = this.ctx.createGain();
      master.connect(compressor).connect(this.ctx.destination);
      for (const bus of ['music', 'sfx', 'ui'] as Bus[]) { const gain = this.ctx.createGain(); gain.connect(master); this.buses.set(bus, gain); }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(bus: Bus, value: number, seconds = .1) {
    const gain = this.buses.get(bus); if (!gain || !this.ctx) return;
    gain.gain.setTargetAtTime(value, this.ctx.currentTime, seconds / 3);
  }

  /** Plays one of `variants` (decoded buffers) with variance; returns false if muted or capped. */
  play(name: string, variants: AudioBuffer[], { bus = 'sfx' as Bus, pitch = .05, gain = .1, maxVoices = 4, volume = 1 } = {}) {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running' || !variants.length) return false;
    const live = (this.voices.get(name) ?? []).filter(v => (v as unknown as { playing?: boolean }).playing !== false);
    if (live.length >= maxVoices) return false;
    const index = pickVariant(variants.length, this.lastVariant.get(name) ?? -1, Math.random); this.lastVariant.set(name, index);
    const source = ctx.createBufferSource(), level = ctx.createGain();
    source.buffer = variants[index];
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch;
    level.gain.value = volume * (1 - Math.random() * gain);
    source.connect(level).connect(this.buses.get(bus)!);
    source.onended = () => { (source as unknown as { playing?: boolean }).playing = false; };
    source.start();
    live.push(source); this.voices.set(name, live);
    return true;
  }
}
