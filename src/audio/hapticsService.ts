import { clamp } from '../data/chapters';

export type HapticEventType =
  | 'nucleosynthesis-burst'
  | 'birth-star-ignition'
  | 'network-impulse'
  | 'chapter-transition'
  | 'reveal-supernova';

export interface HapticEnvironment {
  vibrate?: (pattern: number | number[]) => boolean;
  maxTouchPoints?: number;
  userAgent?: string;
  coarsePointer?: boolean;
  now?: () => number;
}

/**
 * Detects whether the current device is a mobile/touch handset capable of
 * light Vibration API haptic feedback (preventing unsolicited calls on desktops).
 */
export function isMobileHapticDevice(env: HapticEnvironment): boolean {
  if (typeof env.vibrate !== 'function') return false;
  const ua = env.userAgent ?? '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const hasTouch = (env.maxTouchPoints ?? 0) > 0;
  return Boolean(isMobileUa || env.coarsePointer || hasTouch);
}

/**
 * Generates light, short, refined haptic pulse patterns (strictly 8ms..36ms per pulse)
 * tailored to high-impact cosmic audio-visual moments so mobile haptics feel delicate
 * and cinematic rather than harsh or motor-like.
 */
export function buildHapticPattern(
  eventType: HapticEventType,
  intensity = 1.0,
): number | number[] {
  const scale = clamp(intensity, 0.5, 1.35);
  const pulse = (ms: number) => Math.round(clamp(ms * scale, 8, 36));

  switch (eventType) {
    case 'nucleosynthesis-burst':
      // Crisp light ignition tap + subtle shockwave afterglow
      return [pulse(11), 26, pulse(16)];
    case 'birth-star-ignition':
      // Tender twin-heartbeat star birth pulse
      return [pulse(14), 34, pulse(20)];
    case 'network-impulse':
      // Feather-light single tap
      return pulse(9);
    case 'chapter-transition':
      // Brief soft gravitational-lens transition tap
      return pulse(12);
    case 'reveal-supernova':
      // Gentle ceremonial three-step shimmer
      return [pulse(14), 36, pulse(22), 48, pulse(16)];
  }
}

function createBrowserHapticEnv(): HapticEnvironment {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  const coarsePointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  return {
    vibrate: typeof nav.vibrate === 'function' ? (p) => nav.vibrate(p) : undefined,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    userAgent: nav.userAgent ?? '',
    coarsePointer,
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

/**
 * Vibration API Haptics Service for mobile users.
 * Safely triggers short, subtle haptic pulses during high-impact audio & visual
 * moments (such as Stellar Nucleosynthesis bursts) with cooldown throttling and
 * automatic mute/pause gating.
 */
export class HapticsService {
  private readonly env: HapticEnvironment;
  private readonly minCooldownMs: number;
  private enabled = true;
  private muted = false;
  private lastPulseAt = -Infinity;
  private pulseCount = 0;
  private lastEvent: HapticEventType | null = null;
  private lastPattern: number | number[] | null = null;

  constructor(env: HapticEnvironment = createBrowserHapticEnv(), minCooldownMs = 260) {
    this.env = env;
    this.minCooldownMs = Math.max(0, minCooldownMs);
  }

  public isSupported(): boolean {
    return isMobileHapticDevice(this.env);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.cancel();
  }

  public trigger(
    eventType: HapticEventType,
    intensity = 1.0,
    bypassCooldown = false,
  ): boolean {
    if (!this.enabled || this.muted || !this.isSupported() || !this.env.vibrate) {
      return false;
    }

    const now = this.env.now ? this.env.now() : Date.now();
    if (!bypassCooldown && now - this.lastPulseAt < this.minCooldownMs) {
      return false;
    }

    const pattern = buildHapticPattern(eventType, intensity);
    try {
      const ok = this.env.vibrate(pattern);
      if (ok !== false) {
        this.lastPulseAt = now;
        this.pulseCount += 1;
        this.lastEvent = eventType;
        this.lastPattern = pattern;
        return true;
      }
    } catch {
      // Ignore blocked vibration calls prior to user gesture
    }
    return false;
  }

  public cancel(): void {
    if (this.pulseCount > 0 && typeof this.env.vibrate === 'function') {
      try {
        this.env.vibrate(0);
      } catch {
        // Ignore unsupported cancel
      }
    }
  }

  public getPulseCount(): number {
    return this.pulseCount;
  }

  public getLastEvent(): HapticEventType | null {
    return this.lastEvent;
  }

  public getLastPattern(): number | number[] | null {
    return this.lastPattern;
  }
}
