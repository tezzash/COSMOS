import {
  ChapterId,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  getChapterAtTime,
  smoothstep,
} from '../data/chapters';
import { NarrationLine } from '../data/screenplay';
import {
  type AmbientAtmosphereState,
  computeAmbientAtmosphereState,
} from './ambientAtmosphere';
import {
  type AudioClockAnchor,
  type CaptionSyncSnapshot,
  type SpeechProgressState,
  createInitialAudioClockAnchor,
  reanchorAudioClock,
  resolveCaptionSyncSnapshot,
} from './audioClockSync';
import { computeSyncedSpeechPlan } from './voiceSync';

interface ChapterHarmony {
  /** Warm cello/string register chord tones (strictly >= 130 Hz — zero sub-bass motor buzz) */
  padNotes: number[];
  /** Delicate felt-piano & celestial harp arpeggio tones */
  melodyNotes: number[];
  /** Soft upper glass-harp shimmer notes for sparkle */
  shimmerNotes: number[];
  padVolume: number;
  melodyVolume: number;
  noteIntervalMs: number;
  filterCutoff: number;
}

const CHAPTER_HARMONIES: Record<ChapterId, ChapterHarmony> = {
  prologue: {
    padNotes: [146.83, 220.0, 293.66, 369.99], // Dmaj7 warm expansive wonder
    melodyNotes: [587.33, 659.25, 739.99, 440.0, 554.37, 440.0],
    shimmerNotes: [1174.66, 880.0, 1108.73],
    padVolume: 0.11,
    melodyVolume: 0.085,
    noteIntervalMs: 2650,
    filterCutoff: 880,
  },
  'chapter-1': {
    padNotes: [164.81, 220.0, 277.18, 329.63], // A major warm sunrise over Hyderabad
    melodyNotes: [440.0, 554.37, 659.25, 880.0, 739.99, 659.25],
    shimmerNotes: [1108.73, 1318.51, 880.0],
    padVolume: 0.125,
    melodyVolume: 0.095,
    noteIntervalMs: 2050,
    filterCutoff: 1180,
  },
  'chapter-2': {
    padNotes: [185.0, 246.94, 293.66, 369.99], // Bm9 airy, bright & playful
    melodyNotes: [587.33, 659.25, 739.99, 987.77, 880.0, 739.99, 659.25],
    shimmerNotes: [1174.66, 1479.98, 1318.51],
    padVolume: 0.11,
    melodyVolume: 0.09,
    noteIntervalMs: 1450,
    filterCutoff: 1420,
  },
  'chapter-3': {
    padNotes: [196.0, 261.63, 329.63, 392.0], // Cmaj9 uplifting heartfelt warmth
    melodyNotes: [523.25, 659.25, 783.99, 987.77, 1046.5, 783.99],
    shimmerNotes: [1318.51, 1567.98, 1046.5],
    padVolume: 0.135,
    melodyVolume: 0.095,
    noteIntervalMs: 1650,
    filterCutoff: 1560,
  },
  'chapter-4': {
    padNotes: [174.61, 233.08, 293.66, 349.23], // Bbmaj7 twin harmonic equilibrium
    melodyNotes: [466.16, 587.33, 698.46, 880.0, 698.46, 523.25],
    shimmerNotes: [1174.66, 1396.91, 932.33],
    padVolume: 0.12,
    melodyVolume: 0.092,
    noteIntervalMs: 1750,
    filterCutoff: 1380,
  },
  'chapter-5': {
    padNotes: [164.81, 220.0, 261.63, 329.63], // Am9 intimate tender quiet hours
    melodyNotes: [329.63, 392.0, 440.0, 523.25, 493.88, 392.0],
    shimmerNotes: [659.25, 880.0],
    padVolume: 0.055,
    melodyVolume: 0.072,
    noteIntervalMs: 3100,
    filterCutoff: 740,
  },
  'final-chapter': {
    padNotes: [196.0, 261.63, 329.63, 392.0], // Cmaj9 radiant birthday celebration
    melodyNotes: [523.25, 587.33, 659.25, 783.99, 1046.5, 987.77, 783.99],
    shimmerNotes: [1318.51, 1567.98, 2093.0],
    padVolume: 0.145,
    melodyVolume: 0.105,
    noteIntervalMs: 1400,
    filterCutoff: 1750,
  },
};

/**
 * Generates a warm Concert-Hall / Celestial Chamber Convolution Impulse Response
 * procedurally with silky air-absorption high-frequency damping.
 */
function createCathedralImpulseResponse(
  ctx: AudioContext,
  durationSec = 3.2,
  decayPower = 2.7,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const impulse = ctx.createBuffer(2, length, rate);

  let seed = 25112002;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    let lpState = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decayPower);
      const noise = rand();
      const cutoff = 0.24 * (1 - t * 0.65);
      lpState += (noise - lpState) * cutoff;
      const earlyTap =
        i === Math.floor(rate * (0.019 + ch * 0.007)) ||
        i === Math.floor(rate * (0.041 + ch * 0.011)) ||
        i === Math.floor(rate * (0.065 - ch * 0.005))
          ? 0.36
          : 0;
      channelData[i] = (lpState * env * 0.8 + earlyTap) * 0.68;
    }
  }
  return impulse;
}

/**
 * Generates a seamless looping stereo silky pink-air texture for the 'Ambient Atmosphere'
 * layer. Uses Paul Kellet's 3-pole pinking filter + gentle crossfade loop wrap so it breathes
 * like pure concert-hall celestial air with zero clicks or harsh buzz.
 */
function createAmbientAtmosphereBuffer(ctx: AudioContext, durationSec = 6.0): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const fadeSamples = Math.min(Math.floor(rate * 0.45), Math.floor(length * 0.15));
  const buffer = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const out = buffer.getChannelData(ch);
    let seed = (ch === 0 ? 20021125 : 20261125) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };

    const raw = new Float32Array(length + fadeSamples);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = rand();
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.085;
    }

    // Equal-power crossfade across the loop seam so repetition is completely imperceptible
    for (let i = 0; i < length; i++) {
      if (i < fadeSamples) {
        const alpha = i / fadeSamples;
        const fadeIn = Math.sin(alpha * Math.PI * 0.5);
        const fadeOut = Math.cos(alpha * Math.PI * 0.5);
        out[i] = raw[i] * fadeIn + raw[length + i] * fadeOut;
      } else {
        out[i] = raw[i];
      }
    }
  }

  return buffer;
}

/**
 * Selects the warmest, highest-quality natural English voice available in the browser.
 */
function pickPreferredNarratorVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferredPatterns = [
    /Google UK English Male/i,
    /Google US English/i,
    /Microsoft.*Natural.*English/i,
    /Natural.*English/i,
    /Daniel/i,
    /Samantha/i,
    /Arthur/i,
    /Oliver/i,
    /Karen/i,
    /Moira/i,
  ];
  for (const rx of preferredPatterns) {
    const match = voices.find((v) => rx.test(v.name) && v.lang.toLowerCase().startsWith('en'));
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang.toLowerCase() === 'en-gb') ??
    voices.find((v) => v.lang.toLowerCase() === 'en-us') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  );
}

/**
 * Celestial Chamber & Felt-Piano Spatial Audio Engine:
 * - Zero sub-bass motor/buzz oscillators: strictly warm vocal/cello-register pure-sine pads
 *   with gentle slow breathing LFO modulation through stereo concert-hall convolution reverb.
 * - Acoustic-voiced Felt Piano & Glass-Harp celesta arpeggios spatialized in 3D via HRTF PannerNode.
 * - Ethereal upper-register celestial choir shimmer rising cleanly into Final Silence.
 * - Caption-locked Web Speech narrator with dynamic rate synchronization & mid-cue seek alignment.
 */
export class AudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scoreGain: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private energyAnalyser: AnalyserNode | null = null;
  private energyBins: Uint8Array<ArrayBuffer> | null = null;
  private anchorPanner: PannerNode | null = null;

  // Warm breathing chamber pad (pure sine voices in cello/viola register — zero buzz!)
  private padOscs: OscillatorNode[] = [];
  private padGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private breathLfo: OscillatorNode | null = null;

  // Ethereal high-register celestial choir shimmer rising into Final Silence
  private shimmerOscs: OscillatorNode[] = [];
  private shimmerGains: GainNode[] = [];
  private shimmerMaster: GainNode | null = null;

  // Dynamic 'Ambient Atmosphere' filtered cosmic-air swell layer synchronized to filmTime
  private atmosphereSource: AudioBufferSourceNode | null = null;
  private atmosphereHighpass: BiquadFilterNode | null = null;
  private atmosphereLowpass: BiquadFilterNode | null = null;
  private atmosphereBandpass: BiquadFilterNode | null = null;
  private atmosphereGain: GainNode | null = null;
  private lastAtmosphereState: AmbientAtmosphereState = computeAmbientAtmosphereState(0, false, false);

  private volume = 0.72;
  private muted = false;
  private playing = false;
  private voiceEnabled = false;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private currentChapter: ChapterId = 'prologue';
  private lastNoteAt = 0;
  private noteIndex = 0;
  private lastSpokenId: string | null = null;
  private speechToken = 0;
  private speechTimerId: number | null = null;
  private inSilenceWindow = false;
  private revealChimePlayed = false;
  private smoothedEnergy = 0;
  private lastAtmosphereImpactId = 'ambient-bed';
  private onHighImpactAudio: ((eventType: 'reveal-supernova' | 'nucleosynthesis-burst', intensity: number) => void) | null = null;

  // High-precision Web Audio API currentTime caption synchronization state
  private clockAnchor: AudioClockAnchor = createInitialAudioClockAnchor(0);
  private speechProgress: SpeechProgressState = {
    lineId: null,
    spokenText: '',
    charOffsetInFullLine: 0,
    lastBoundaryCharIndex: 0,
    speechStartAudioTime: 0,
    estimatedSpokenSec: 1,
    isSpeaking: false,
  };
  private readonly captionListeners = new Set<(snap: CaptionSyncSnapshot) => void>();
  private syncRafId: number | null = null;
  private lastBroadcastKey = '';

  private readonly onVoicesChanged = (): void => {
    this.preferredVoice = pickPreferredNarratorVoice();
  };

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.preferredVoice = pickPreferredNarratorVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', this.onVoicesChanged);
    }
  }

  public initAndStart(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(this.muted ? 0 : this.volume, ctx.currentTime);
      master.connect(ctx.destination);
      this.masterGain = master;

      // Musical warmth analyser feeding gentle organic energy to GPGPU cosmic particles
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      master.connect(analyser);
      this.energyAnalyser = analyser;
      this.energyBins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

      const score = ctx.createGain();
      score.gain.setValueAtTime(1, ctx.currentTime);
      score.connect(master);
      this.scoreGain = score;

      // Concert-Hall / Celestial Cathedral Convolution Reverb
      const conv = ctx.createConvolver();
      conv.buffer = createCathedralImpulseResponse(ctx, 3.2, 2.7);
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(0.42, ctx.currentTime);
      const revSend = ctx.createGain();
      revSend.gain.setValueAtTime(1.0, ctx.currentTime);
      revSend.connect(conv);
      conv.connect(wetGain);
      wetGain.connect(score);
      this.convolver = conv;
      this.reverbSend = revSend;

      // Persistent HRTF 3D Binaural Panner tied to active 3D scene focal anchor
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.maxDistance = 60;
      panner.rolloffFactor = 0.55;
      panner.positionX.setValueAtTime(0, ctx.currentTime);
      panner.positionY.setValueAtTime(0, ctx.currentTime);
      panner.positionZ.setValueAtTime(-5, ctx.currentTime);
      panner.connect(score);
      panner.connect(revSend);
      this.anchorPanner = panner;

      // Warm breathing orchestral strings / choir pad (100% pure sine voices — zero motor buzz!)
      const pFilter = ctx.createBiquadFilter();
      pFilter.type = 'lowpass';
      pFilter.frequency.setValueAtTime(920, ctx.currentTime);
      pFilter.Q.setValueAtTime(0.5, ctx.currentTime);

      const pGain = ctx.createGain();
      pGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      // Slow organic 0.085 Hz breathing swell so the pad feels alive like gentle strings
      const breathGain = ctx.createGain();
      breathGain.gain.setValueAtTime(0.88, ctx.currentTime);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.085, ctx.currentTime);
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.setValueAtTime(0.12, ctx.currentTime);
      lfo.connect(lfoDepth);
      lfoDepth.connect(breathGain.gain);
      lfo.start();
      this.breathLfo = lfo;

      pFilter.connect(pGain);
      pGain.connect(breathGain);
      breathGain.connect(score);
      breathGain.connect(revSend);

      const baseNotes = CHAPTER_HARMONIES.prologue.padNotes;
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine'; // Pure sine: warm, silky, never harsh or buzzing
        const freq = baseNotes[i % baseNotes.length];
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.detune.setValueAtTime((i - 1.5) * 2.4, ctx.currentTime);
        const voiceGain = ctx.createGain();
        // Higher voices slightly gentler for balanced orchestral warmth
        voiceGain.gain.setValueAtTime(i === 0 ? 0.32 : i === 1 ? 0.28 : 0.2, ctx.currentTime);
        osc.connect(voiceGain);
        voiceGain.connect(pFilter);
        osc.start();
        this.padOscs.push(osc);
      }

      this.padFilter = pFilter;
      this.padGain = pGain;

      // Ethereal ascending celestial choir shimmer (261 Hz – 1568 Hz pure sine bells for Final Convergence)
      const shimMaster = ctx.createGain();
      shimMaster.gain.setValueAtTime(0.0001, ctx.currentTime);
      shimMaster.connect(revSend); // Mostly wet ethereal shimmer in cathedral hall
      shimMaster.connect(score);
      this.shimmerMaster = shimMaster;

      const shimmerChord = [261.63, 392.0, 523.25, 659.25];
      for (let i = 0; i < 4; i++) {
        const sOsc = ctx.createOscillator();
        sOsc.type = 'sine';
        sOsc.frequency.setValueAtTime(shimmerChord[i], ctx.currentTime);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        sOsc.connect(sGain);
        sGain.connect(shimMaster);
        sOsc.start();
        this.shimmerOscs.push(sOsc);
        this.shimmerGains.push(sGain);
      }

      // Dynamic 'Ambient Atmosphere' filtered air-swell layer (high-passed >= 165 Hz for zero buzz,
      // dual parallel lowpass + resonant bandpass filters sweeping cleanly during high-impact moments)
      const atmSource = ctx.createBufferSource();
      atmSource.buffer = createAmbientAtmosphereBuffer(ctx, 6.0);
      atmSource.loop = true;

      const atmHp = ctx.createBiquadFilter();
      atmHp.type = 'highpass';
      atmHp.frequency.setValueAtTime(165, ctx.currentTime);
      atmHp.Q.setValueAtTime(0.7, ctx.currentTime);

      const atmLp = ctx.createBiquadFilter();
      atmLp.type = 'lowpass';
      atmLp.frequency.setValueAtTime(360, ctx.currentTime);
      atmLp.Q.setValueAtTime(0.7, ctx.currentTime);

      const atmBp = ctx.createBiquadFilter();
      atmBp.type = 'bandpass';
      atmBp.frequency.setValueAtTime(440, ctx.currentTime);
      atmBp.Q.setValueAtTime(1.1, ctx.currentTime);

      const lpMix = ctx.createGain();
      lpMix.gain.setValueAtTime(0.74, ctx.currentTime);
      const bpMix = ctx.createGain();
      bpMix.gain.setValueAtTime(0.46, ctx.currentTime);

      const atmGain = ctx.createGain();
      atmGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      atmSource.connect(atmHp);
      atmHp.connect(atmLp);
      atmHp.connect(atmBp);
      atmLp.connect(lpMix);
      atmBp.connect(bpMix);
      lpMix.connect(atmGain);
      bpMix.connect(atmGain);
      atmGain.connect(score);
      atmGain.connect(revSend);
      atmSource.start();

      this.atmosphereSource = atmSource;
      this.atmosphereHighpass = atmHp;
      this.atmosphereLowpass = atmLp;
      this.atmosphereBandpass = atmBp;
      this.atmosphereGain = atmGain;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.playing = true;
    this.revealChimePlayed = false;
    this.clockAnchor = reanchorAudioClock(
      this.clockAnchor.filmTimeAnchor,
      this.getAudioCurrentTime(),
      true,
    );
    this.applyChapterMix(this.currentChapter, 1.8);
    this.updateAmbientAtmosphere(this.clockAnchor.filmTimeAnchor);
    this.ensureCaptionSyncLoop();
    this.emitCaptionSync(true);
  }

  /**
   * Returns high-precision Web Audio API hardware clock seconds (or performance.now fallback).
   */
  public getAudioCurrentTime(): number {
    if (this.ctx) {
      return this.ctx.currentTime;
    }
    return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  }

  /**
   * Anchors the Web Audio currentTime master clock to an exact film timestamp
   * (called on enter, seek, play/pause, replay, or gentle drift alignment).
   */
  public syncClock(filmTime: number, playing: boolean = this.playing): void {
    this.clockAnchor = reanchorAudioClock(filmTime, this.getAudioCurrentTime(), playing);
    this.emitCaptionSync(true);
  }

  /**
   * Subscribes a high-precision listener driven directly by Web Audio API `ctx.currentTime`
   * to trigger NarrationOverlay captions and track live synthesized speech word progress.
   */
  public subscribeCaptionSync(
    listener: (snapshot: CaptionSyncSnapshot) => void,
  ): () => void {
    this.captionListeners.add(listener);
    this.ensureCaptionSyncLoop();
    this.emitCaptionSync(true);
    return () => {
      this.captionListeners.delete(listener);
      if (this.captionListeners.size === 0 && this.syncRafId !== null) {
        cancelAnimationFrame(this.syncRafId);
        this.syncRafId = null;
      }
    };
  }

  private ensureCaptionSyncLoop(): void {
    if (this.syncRafId !== null || this.captionListeners.size === 0) return;
    if (typeof window === 'undefined') return;
    const tick = () => {
      if (this.captionListeners.size === 0) {
        this.syncRafId = null;
        return;
      }
      this.emitCaptionSync(false);
      this.syncRafId = window.requestAnimationFrame(tick);
    };
    this.syncRafId = window.requestAnimationFrame(tick);
  }

  private emitCaptionSync(force: boolean): void {
    if (this.captionListeners.size === 0) return;
    const nowAudio = this.getAudioCurrentTime();
    const clockSource = this.ctx ? 'web-audio' : 'fallback';
    const snap = resolveCaptionSyncSnapshot(
      this.clockAnchor,
      nowAudio,
      this.speechProgress,
      clockSource,
    );

    // Dynamically trigger synthesized speech at the exact Web Audio currentTime cue edge
    if (this.playing && this.voiceEnabled && !this.muted) {
      if (snap.line && snap.line.id !== this.lastSpokenId) {
        this.speakLine(snap.line, snap.filmTime);
      } else if (!snap.line && this.lastSpokenId !== null) {
        this.speakLine(null, snap.filmTime);
      }
    }

    const broadcastKey = `${snap.line?.id ?? 'none'}|${snap.isSpeaking ? 1 : 0}|${snap.spokenCharIndex}|${snap.clockSource}`;
    if (!force && broadcastKey === this.lastBroadcastKey) {
      return;
    }
    this.lastBroadcastKey = broadcastKey;
    for (const listener of this.captionListeners) {
      listener(snap);
    }
  }

  public setHighImpactAudioListener(
    listener:
      | ((eventType: 'reveal-supernova' | 'nucleosynthesis-burst', intensity: number) => void)
      | null,
  ): void {
    this.onHighImpactAudio = listener;
  }

  /**
   * Updates the 3D HRTF binaural spatial position relative to the viewer (camera space).
   */
  public setSpatialAnchor(relX: number, relY: number, relZ: number): void {
    if (!this.ctx || !this.anchorPanner) return;
    const now = this.ctx.currentTime;
    this.anchorPanner.positionX.setTargetAtTime(clamp(relX, -14, 14), now, 0.1);
    this.anchorPanner.positionY.setTargetAtTime(clamp(relY, -8, 8), now, 0.1);
    this.anchorPanner.positionZ.setTargetAtTime(clamp(relZ, -20, -2), now, 0.1);
  }

  /**
   * Reads real-time smoothed warm musical energy [0..1] to drive gentle GPGPU particle breath.
   */
  public getBassEnergy(): number {
    if (!this.energyAnalyser || !this.energyBins || !this.playing || this.muted || this.inSilenceWindow) {
      this.smoothedEnergy *= 0.9;
      return this.smoothedEnergy;
    }
    this.energyAnalyser.getByteFrequencyData(this.energyBins);
    let sum = 0;
    const startBin = 1;
    const endBin = 11; // Warm harmonic midrange (~150Hz..1.8kHz)
    for (let i = startBin; i < endBin; i++) {
      sum += this.energyBins[i];
    }
    const raw = sum / ((endBin - startBin) * 255);
    this.smoothedEnergy = this.smoothedEnergy * 0.8 + raw * 0.2;
    return clamp(this.smoothedEnergy, 0, 1);
  }

  private cancelSpeechNow(): void {
    this.speechToken += 1;
    if (this.speechTimerId !== null) {
      window.clearTimeout(this.speechTimerId);
      this.speechTimerId = null;
    }
    this.speechProgress = {
      ...this.speechProgress,
      isSpeaking: false,
      lastBoundaryCharIndex: 0,
    };
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public resetSpeech(): void {
    this.lastSpokenId = null;
    this.cancelSpeechNow();
    this.emitCaptionSync(true);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted || !this.playing ? 0 : this.volume,
        this.ctx.currentTime,
        0.12,
      );
    }
    if (muted) {
      this.cancelSpeechNow();
    }
  }

  public setVolume(vol: number): void {
    this.volume = clamp(vol, 0, 1);
    if (this.ctx && this.masterGain && !this.muted && this.playing) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  public setPlaying(playing: boolean): void {
    const nowAudio = this.getAudioCurrentTime();
    const currentFilm = this.playing
      ? this.clockAnchor.filmTimeAnchor + Math.max(0, nowAudio - this.clockAnchor.audioTimeAnchor)
      : this.clockAnchor.filmTimeAnchor;
    this.playing = playing;
    this.clockAnchor = reanchorAudioClock(currentFilm, nowAudio, playing);
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        !playing || this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.18,
      );
    }
    if (!playing) {
      this.cancelSpeechNow();
      this.lastSpokenId = null;
    }
    this.emitCaptionSync(true);
  }

  public setVoiceNarration(enabled: boolean): void {
    this.voiceEnabled = enabled;
    this.lastSpokenId = null;
    if (!enabled) {
      this.cancelSpeechNow();
    }
    this.emitCaptionSync(true);
  }

  /**
   * Synchronizes Web Speech narration strictly to the active caption's exact [start, end]
   * timing window, dynamically calibrating speaking rate so voice never lags behind captions.
   */
  public speakLine(line: NarrationLine | null, currentFilmTime: number): void {
    if (!line) {
      if (this.lastSpokenId !== null) {
        this.lastSpokenId = null;
        this.cancelSpeechNow();
      }
      return;
    }

    if (!this.voiceEnabled || this.muted || !this.playing) return;
    if (line.id === this.lastSpokenId) return;

    const plan = computeSyncedSpeechPlan(
      line.text,
      line.start,
      line.end,
      currentFilmTime,
      line.tone,
    );
    this.lastSpokenId = line.id;

    if (!plan) {
      this.cancelSpeechNow();
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.cancelSpeechNow();
      const token = this.speechToken;
      // Small 18ms post-cancel delay prevents Chromium's synchronous cancel()+speak() silent-drop bug
      this.speechTimerId = window.setTimeout(() => {
        this.speechTimerId = null;
        if (token !== this.speechToken || !this.voiceEnabled || this.muted || !this.playing) {
          return;
        }
        const utter = new SpeechSynthesisUtterance(plan.text);
        if (!this.preferredVoice) {
          this.preferredVoice = pickPreferredNarratorVoice();
        }
        if (this.preferredVoice) {
          utter.voice = this.preferredVoice;
        }
        utter.rate = plan.rate;
        utter.pitch = plan.pitch;
        utter.volume = Math.min(1, Math.max(0.45, this.volume));

        const charOffset = Math.max(0, line.text.indexOf(plan.text));
        const estimatedSpokenSec = Math.max(0.4, plan.estimatedSecAt1x / plan.rate);
        this.speechProgress = {
          lineId: line.id,
          spokenText: plan.text,
          charOffsetInFullLine: charOffset,
          lastBoundaryCharIndex: 0,
          speechStartAudioTime: this.getAudioCurrentTime(),
          estimatedSpokenSec,
          isSpeaking: true,
        };

        utter.onstart = () => {
          if (token !== this.speechToken) return;
          this.speechProgress = {
            ...this.speechProgress,
            speechStartAudioTime: this.getAudioCurrentTime(),
            isSpeaking: true,
          };
          this.emitCaptionSync(true);
        };
        utter.onboundary = (ev) => {
          if (token !== this.speechToken) return;
          if (typeof ev.charIndex === 'number' && ev.charIndex >= 0) {
            this.speechProgress = {
              ...this.speechProgress,
              lastBoundaryCharIndex: ev.charIndex + (ev.charLength || 0),
              isSpeaking: true,
            };
            this.emitCaptionSync(true);
          }
        };
        utter.onend = () => {
          if (token !== this.speechToken) return;
          this.speechProgress = {
            ...this.speechProgress,
            lastBoundaryCharIndex: plan.text.length,
            isSpeaking: false,
          };
          this.emitCaptionSync(true);
        };
        utter.onerror = () => {
          if (token !== this.speechToken) return;
          this.speechProgress = {
            ...this.speechProgress,
            isSpeaking: false,
          };
          this.emitCaptionSync(true);
        };

        this.emitCaptionSync(true);
        window.speechSynthesis.speak(utter);
      }, 18);
    }
  }

  private applyChapterMix(chapterId: ChapterId, rampSeconds = 2.2): void {
    if (!this.ctx || !this.padGain || !this.padFilter) return;
    const h = CHAPTER_HARMONIES[chapterId];
    const now = this.ctx.currentTime;

    this.padOscs.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(
        h.padNotes[i % h.padNotes.length],
        now,
        rampSeconds * 0.5,
      );
    });
    this.padFilter.frequency.setTargetAtTime(h.filterCutoff, now, rampSeconds * 0.55);
    this.padGain.gain.setTargetAtTime(h.padVolume, now, rampSeconds * 0.55);
  }

  /**
   * Warm acoustic-style Felt Piano & Celestial Harp note (100% pure sine partials — silky,
   * tender, and resonant, with zero harsh buzzing harmonics).
   */
  private playFeltPianoNote(
    freq: number,
    gainPeak = 0.085,
    duration = 3.2,
    spatialPos?: readonly [number, number, number],
    celestaShimmer = false,
  ): void {
    if (!this.ctx || !this.scoreGain || this.muted || !this.playing) return;
    const now = this.ctx.currentTime;

    const fund = this.ctx.createOscillator();
    const oct2 = this.ctx.createOscillator();
    const harm3 = this.ctx.createOscillator();

    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, now);

    oct2.type = 'sine';
    oct2.frequency.setValueAtTime(freq * 2, now);

    harm3.type = 'sine';
    harm3.frequency.setValueAtTime(freq * (celestaShimmer ? 4 : 3), now);

    const fundEnv = this.ctx.createGain();
    fundEnv.gain.setValueAtTime(0.0001, now);
    fundEnv.gain.linearRampToValueAtTime(gainPeak, now + 0.028);
    fundEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Warm 2nd partial decays slightly faster like real felt piano strings
    const oct2Env = this.ctx.createGain();
    oct2Env.gain.setValueAtTime(0.0001, now);
    oct2Env.gain.linearRampToValueAtTime(gainPeak * (celestaShimmer ? 0.32 : 0.24), now + 0.02);
    oct2Env.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.62);

    // Delicate crystalline bell attack that vanishes swiftly into warm sustain
    const harm3Env = this.ctx.createGain();
    harm3Env.gain.setValueAtTime(0.0001, now);
    harm3Env.gain.linearRampToValueAtTime(gainPeak * (celestaShimmer ? 0.14 : 0.07), now + 0.014);
    harm3Env.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.28);

    const sumNode = this.ctx.createGain();
    sumNode.gain.setValueAtTime(1.0, now);

    fund.connect(fundEnv);
    oct2.connect(oct2Env);
    harm3.connect(harm3Env);
    fundEnv.connect(sumNode);
    oct2Env.connect(sumNode);
    harm3Env.connect(sumNode);

    if (spatialPos) {
      const notePanner = this.ctx.createPanner();
      notePanner.panningModel = 'HRTF';
      notePanner.distanceModel = 'inverse';
      notePanner.refDistance = 3.8;
      notePanner.positionX.setValueAtTime(clamp(spatialPos[0], -12, 12), now);
      notePanner.positionY.setValueAtTime(clamp(spatialPos[1], -6, 6), now);
      notePanner.positionZ.setValueAtTime(clamp(spatialPos[2], -14, -2), now);
      sumNode.connect(notePanner);
      notePanner.connect(this.scoreGain);
      if (this.reverbSend) notePanner.connect(this.reverbSend);
    } else if (this.anchorPanner) {
      sumNode.connect(this.anchorPanner);
    } else {
      sumNode.connect(this.scoreGain);
      if (this.reverbSend) sumNode.connect(this.reverbSend);
    }

    fund.start(now);
    oct2.start(now);
    harm3.start(now);
    const stopAt = now + duration + 0.12;
    fund.stop(stopAt);
    oct2.stop(stopAt);
    harm3.stop(stopAt);
  }

  public playInteractionChime(
    pitchMultiplier = 1.0,
    spatialPos?: readonly [number, number, number],
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const base = 523.25 * pitchMultiplier;
    this.playFeltPianoNote(base, 0.1, 2.6, spatialPos, true);
    window.setTimeout(() => this.playFeltPianoNote(base * 1.5, 0.07, 2.8, spatialPos, true), 140);
  }

  /**
   * Ethereal upper-register celestial choir shimmer rising smoothly during
   * Final Convergence (336s..364.8s), cutting into pure silence right before ISHA.
   */
  private updateCelestialShimmerSwell(filmTime: number): void {
    if (!this.ctx || !this.shimmerMaster || this.shimmerOscs.length === 0) return;
    const now = this.ctx.currentTime;
    const swellEnv =
      smoothstep(336.0, 362.0, filmTime) * (1 - smoothstep(SILENCE_START - 0.35, SILENCE_START, filmTime));
    this.shimmerMaster.gain.setTargetAtTime(swellEnv * 0.075, now, 0.16);

    if (swellEnv > 0.002) {
      // Gentle crystalline ascending major-9th harmonic lift (C4 -> G5 — luminous, zero low buzz)
      const lift = smoothstep(336.0, 364.0, filmTime);
      const chordBase = [261.63, 392.0, 493.88, 659.25];
      for (let i = 0; i < this.shimmerOscs.length; i++) {
        const freq = chordBase[i] * (1 + lift * 0.25);
        this.shimmerOscs[i].frequency.setTargetAtTime(freq, now, 0.15);
        this.shimmerGains[i].gain.setTargetAtTime(0.24 * (1 - i * 0.12), now, 0.15);
      }
    }
  }

  /**
   * Dynamically sweeps the 'Ambient Atmosphere' lowpass + resonant bandpass frequency
   * filters in sync with `filmTime` to create a subtle cinematic air swell during
   * high-impact film moments while staying silky and whisper-quiet during calm beats.
   */
  private updateAmbientAtmosphere(filmTime: number): void {
    const state = computeAmbientAtmosphereState(filmTime, this.playing, this.muted);
    this.lastAtmosphereState = state;
    if (
      state.activeMoment !== this.lastAtmosphereImpactId &&
      state.swellIntensity >= 0.45 &&
      state.activeMoment !== 'ambient-bed' &&
      state.activeMoment !== 'sacred-silence'
    ) {
      this.lastAtmosphereImpactId = state.activeMoment;
      this.onHighImpactAudio?.(
        state.activeMoment === 'title-reveal-bloom' ? 'reveal-supernova' : 'nucleosynthesis-burst',
        0.75 + state.swellIntensity * 0.3,
      );
    } else if (state.swellIntensity < 0.15) {
      this.lastAtmosphereImpactId = 'ambient-bed';
    }
    if (!this.ctx || !this.atmosphereLowpass || !this.atmosphereBandpass || !this.atmosphereGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const ramp = state.activeMoment === 'sacred-silence' ? 0.14 : 0.28;
    this.atmosphereLowpass.frequency.setTargetAtTime(state.lowpassHz, now, ramp);
    this.atmosphereBandpass.frequency.setTargetAtTime(state.bandpassHz, now, ramp);
    this.atmosphereBandpass.Q.setTargetAtTime(state.bandpassQ, now, ramp);
    this.atmosphereGain.gain.setTargetAtTime(Math.max(0.0001, state.gain), now, ramp);
  }

  public getAmbientAtmosphereState(): AmbientAtmosphereState {
    return this.lastAtmosphereState;
  }

  public update(filmTime: number): void {
    // Keep Web Audio clock anchor drift-corrected within 60ms of the 3D film timeline
    const nowAudio = this.getAudioCurrentTime();
    const anchoredFilm = this.clockAnchor.playing
      ? this.clockAnchor.filmTimeAnchor + Math.max(0, nowAudio - this.clockAnchor.audioTimeAnchor)
      : this.clockAnchor.filmTimeAnchor;
    if (Math.abs(anchoredFilm - filmTime) > 0.06 || this.clockAnchor.playing !== this.playing) {
      this.clockAnchor = reanchorAudioClock(filmTime, nowAudio, this.playing);
    }

    if (!this.ctx || !this.scoreGain || !this.playing) return;

    const chapter = getChapterAtTime(filmTime);
    if (chapter.id !== this.currentChapter) {
      this.currentChapter = chapter.id;
      this.applyChapterMix(chapter.id, 2.4);
    }

    this.updateCelestialShimmerSwell(filmTime);
    this.updateAmbientAtmosphere(filmTime);

    // Complete sacred orchestral silence right before the ISHA title reveal (365.0s..370.5s)
    const shouldBeSilent = filmTime >= SILENCE_START && filmTime < SILENCE_END;
    if (shouldBeSilent !== this.inSilenceWindow) {
      this.inSilenceWindow = shouldBeSilent;
      this.scoreGain.gain.setTargetAtTime(
        shouldBeSilent ? 0.0001 : 1.0,
        this.ctx.currentTime,
        shouldBeSilent ? 0.18 : 0.75,
      );
    }

    // Warm celebratory spatialized harp & felt-piano cascade right at the ISHA reveal
    if (filmTime >= TITLE_REVEAL_TIME && !this.revealChimePlayed) {
      this.revealChimePlayed = true;
      this.onHighImpactAudio?.('reveal-supernova', 1.15);
      this.playFeltPianoNote(261.63, 0.09, 5.2, [-1.0, -0.5, -5.5], false); // C4 warm root
      window.setTimeout(() => this.playFeltPianoNote(392.0, 0.085, 4.8, [-2.4, 0.4, -5.0], false), 140); // G4
      window.setTimeout(() => this.playFeltPianoNote(523.25, 0.105, 4.8, [2.2, 0.9, -4.8], true), 290); // C5
      window.setTimeout(() => this.playFeltPianoNote(659.25, 0.095, 4.6, [-1.8, 1.5, -4.5], true), 470); // E5
      window.setTimeout(() => this.playFeltPianoNote(783.99, 0.09, 5.0, [1.5, 2.0, -4.2], true), 670); // G5
      window.setTimeout(() => this.playFeltPianoNote(1046.5, 0.08, 5.6, [0, 2.5, -4.0], true), 900); // C6
    } else if (filmTime < SILENCE_START) {
      this.revealChimePlayed = false;
    }

    if (shouldBeSilent || filmTime < 2.5) return;

    const harmony = CHAPTER_HARMONIES[chapter.id];
    const nowMs = performance.now();
    if (nowMs - this.lastNoteAt >= harmony.noteIntervalMs) {
      this.lastNoteAt = nowMs;
      const freq = harmony.melodyNotes[this.noteIndex % harmony.melodyNotes.length];
      const step = this.noteIndex;
      this.noteIndex += 1;

      const dur = chapter.id === 'chapter-5' ? 4.4 : 3.2;
      const panAngle = step * 0.85;
      const spatialPos: readonly [number, number, number] = [
        Math.sin(panAngle) * 3.6,
        Math.cos(panAngle * 0.7) * 1.3,
        -5.5,
      ];

      this.playFeltPianoNote(freq, harmony.melodyVolume, dur, spatialPos, false);

      // Every 3rd beat, add a delicate high celestial harp shimmer echo
      if (step % 3 === 1 && chapter.id !== 'chapter-5') {
        const shimFreq = harmony.shimmerNotes[step % harmony.shimmerNotes.length];
        window.setTimeout(() => {
          this.playFeltPianoNote(shimFreq, harmony.melodyVolume * 0.42, 2.8, [
            -spatialPos[0] * 0.8,
            spatialPos[1] + 0.8,
            -5.0,
          ], true);
        }, 360);
      }
    }
  }

  public dispose(): void {
    if (this.syncRafId !== null) {
      cancelAnimationFrame(this.syncRafId);
      this.syncRafId = null;
    }
    this.captionListeners.clear();
    this.cancelSpeechNow();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.removeEventListener?.('voiceschanged', this.onVoicesChanged);
    }
    if (this.breathLfo) {
      try {
        this.breathLfo.stop();
      } catch {
        // Ignore already-stopped oscillator
      }
      this.breathLfo = null;
    }
    if (this.atmosphereSource) {
      try {
        this.atmosphereSource.stop();
      } catch {
        // Ignore already-stopped source
      }
      this.atmosphereSource = null;
      this.atmosphereHighpass = null;
      this.atmosphereLowpass = null;
      this.atmosphereBandpass = null;
      this.atmosphereGain = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.convolver = null;
      this.reverbSend = null;
      this.energyAnalyser = null;
      this.anchorPanner = null;
    }
  }
}
