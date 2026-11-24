import { clamp } from '@/data/chapters';
import type { EnvQualityOverride } from '@/utils/env';

export type QualityTier = 'HIGH' | 'BALANCED' | 'THERMAL-SAFE';
export type QualityMode = 'auto' | 'high' | 'balanced' | 'thermal-safe';
export type ShaderPrecision = 'highp' | 'mediump';
export type EffectPrecisionRole = 'hero' | 'ambient';

export interface DeviceSignals {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  anyHover: boolean;
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  prefersReducedMotion: boolean;
  standalone?: boolean;
}

export interface DeviceProfile {
  isMobile: boolean;
  isIOS: boolean;
  isIOSSafari: boolean;
  isIPhoneProMaxClass: boolean;
  isHighPpi: boolean;
  isStandaloneWebApp: boolean;
  prefersReducedMotion: boolean;
  nativePixelRatio: number;
  /** Target frame ceiling (60 FPS on ProMotion/mobile to prevent overheating while staying silky) */
  targetFps: number;
  initialTier: QualityTier;
}

export interface QualityTierSettings {
  tier: QualityTier;
  maxDpr: number;
  bloomEnabled: boolean;
  bloomResolutionScale: number;
  particleDrawRatio: number;
  /** Preserves visual parity on hero set pieces (e.g. Chapter IV Yin-Yang) even on mobile */
  yinYangScaleFactor: number;
  yinYangDrawRatio: number;
  /** Non-critical ambient cosmic shaders drop to mediump on mobile/balanced to save GPU bandwidth */
  ambientShaderPrecision: ShaderPrecision;
  /** Central hero set pieces (Yin-Yang, Earth, Singularity) always render at full highp precision */
  heroShaderPrecision: 'highp';
  gpgpuEnabled: boolean;
  cinemaGrainEnabled: boolean;
  targetFrameMs: number;
}

export interface QualitySnapshot {
  mode: QualityMode;
  activeTier: QualityTier;
  effectiveDpr: number;
  nativeDpr: number;
  ambientShaderPrecision: ShaderPrecision;
  heroShaderPrecision: 'highp';
  isMobile: boolean;
  isHighPpi: boolean;
  averageFps: number;
}

const TIER_ORDER: readonly QualityTier[] = ['HIGH', 'BALANCED', 'THERMAL-SAFE'];
const QUALITY_MODE_ORDER: readonly QualityMode[] = ['auto', 'high', 'balanced', 'thermal-safe'];

export function qualityModeToTier(mode: Exclude<QualityMode, 'auto'>): QualityTier {
  if (mode === 'high') return 'HIGH';
  if (mode === 'balanced') return 'BALANCED';
  return 'THERMAL-SAFE';
}

export function getNextQualityMode(current: QualityMode): QualityMode {
  const idx = QUALITY_MODE_ORDER.indexOf(current);
  return QUALITY_MODE_ORDER[(idx + 1) % QUALITY_MODE_ORDER.length] ?? 'auto';
}

export function formatQualityModeLabel(mode: QualityMode): string {
  if (mode === 'auto') return 'Auto';
  if (mode === 'high') return 'High';
  if (mode === 'balanced') return 'Balanced';
  return 'Saver';
}

export function formatQualityTierLabel(tier: QualityTier): string {
  if (tier === 'HIGH') return 'High';
  if (tier === 'BALANCED') return 'Balanced';
  return 'Saver';
}

/**
 * Reliable multi-signal mobile, iOS Safari, high-PPI display, and iPhone Pro Max detection.
 * Never depends solely on window.innerWidth so landscape phones and iPadOS desktop-mode
 * are classified accurately.
 */
export function detectDeviceProfile(
  signals: DeviceSignals,
  qualityOverride: EnvQualityOverride = 'auto',
): DeviceProfile {
  const ua = signals.userAgent || '';
  const platform = signals.platform || '';
  const dpr = clamp(signals.devicePixelRatio || 1, 1, 4);

  const isIPhoneUA = /iPhone|iPod/i.test(ua);
  const isIPadUA =
    /iPad/i.test(ua) ||
    (/Macintosh/i.test(platform) && signals.maxTouchPoints > 1) ||
    (/Macintosh/i.test(ua) && signals.maxTouchPoints > 1);
  const isIOS = isIPhoneUA || isIPadUA;
  const isIOSSafari =
    isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);

  const isAndroidMobile = /Android/i.test(ua) && /Mobile/i.test(ua);
  const shortSide = Math.min(signals.screenWidth || signals.innerWidth, signals.screenHeight || signals.innerHeight);
  const longSide = Math.max(signals.screenWidth || signals.innerWidth, signals.screenHeight || signals.innerHeight);

  // Coarse pointer + touch points catch phones even in landscape orientation (> 768px wide)
  const touchPhoneHeuristic =
    signals.coarsePointer && !signals.anyHover && signals.maxTouchPoints >= 1 && shortSide <= 540;
  const isMobile = isIPhoneUA || isAndroidMobile || touchPhoneHeuristic;
  const isHighPpi = dpr >= 2.25;

  // iPhone 16/17 Pro Max 6.9-inch class: ~440x956 logical pt at 3x DPR (2868x1320 native px)
  const physicalLong = Math.round(longSide * dpr);
  const physicalShort = Math.round(shortSide * dpr);
  const isIPhoneProMaxClass =
    isIPhoneUA &&
    dpr >= 2.8 &&
    physicalLong >= 2700 &&
    physicalShort >= 1250;

  let initialTier: QualityTier = 'HIGH';
  if (qualityOverride === 'high') {
    initialTier = 'HIGH';
  } else if (qualityOverride === 'balanced') {
    initialTier = 'BALANCED';
  } else if (qualityOverride === 'thermal-safe') {
    initialTier = 'THERMAL-SAFE';
  } else {
    const lowMemory =
      typeof signals.deviceMemoryGb === 'number' && signals.deviceMemoryGb > 0 && signals.deviceMemoryGb <= 4;
    const lowCores =
      typeof signals.hardwareConcurrency === 'number' && signals.hardwareConcurrency > 0 && signals.hardwareConcurrency <= 4;
    if (isIPhoneProMaxClass) {
      // Flagship Apple Silicon handles HIGH cleanly with 2.0x DPR cap + mediump ambient shader tier
      initialTier = 'HIGH';
    } else if (isMobile && (lowMemory || lowCores)) {
      initialTier = 'THERMAL-SAFE';
    } else if (isMobile) {
      initialTier = 'BALANCED';
    }
  }

  return {
    isMobile,
    isIOS,
    isIOSSafari,
    isIPhoneProMaxClass,
    isHighPpi,
    isStandaloneWebApp: Boolean(signals.standalone),
    prefersReducedMotion: signals.prefersReducedMotion,
    nativePixelRatio: dpr,
    // Lock mobile / iOS ProMotion to a serene 60 FPS ceiling to eliminate thermal throttling
    targetFps: 60,
    initialTier,
  };
}

export function getQualitySettingsForTier(
  tier: QualityTier,
  profile: DeviceProfile,
  isSoftwareGl: boolean,
): QualityTierSettings {
  if (isSoftwareGl) {
    return {
      tier: 'THERMAL-SAFE',
      maxDpr: 1,
      bloomEnabled: false,
      bloomResolutionScale: 0.5,
      particleDrawRatio: 1.0,
      yinYangScaleFactor: 0.85,
      yinYangDrawRatio: 1.0,
      ambientShaderPrecision: 'mediump',
      heroShaderPrecision: 'highp',
      gpgpuEnabled: false,
      cinemaGrainEnabled: false,
      targetFrameMs: 16.67,
    };
  }

  if (profile.isMobile || profile.isIOS) {
    // High-PPI mobile screens (e.g. 3x OLED) get up to 2.0x crisp DPR in HIGH while offloading
    // non-critical background/ambient shaders to mediump, freeing GPU budget to keep central
    // hero set pieces (Yin-Yang, Earth, Singularity) at full highp parity and high particle density.
    const yinYangScaleFactor = profile.isIPhoneProMaxClass || profile.isHighPpi ? 0.86 : 0.72;

    if (tier === 'HIGH') {
      return {
        tier,
        maxDpr: Math.min(
          profile.nativePixelRatio,
          profile.isIPhoneProMaxClass || profile.isHighPpi ? 2.0 : 1.75,
        ),
        bloomEnabled: true,
        bloomResolutionScale: 0.5,
        particleDrawRatio: 1.0,
        yinYangScaleFactor,
        yinYangDrawRatio: 1.0,
        ambientShaderPrecision: 'mediump',
        heroShaderPrecision: 'highp',
        gpgpuEnabled: true,
        cinemaGrainEnabled: true,
        targetFrameMs: 16.67,
      };
    }
    if (tier === 'BALANCED') {
      return {
        tier,
        maxDpr: Math.min(profile.nativePixelRatio, profile.isHighPpi ? 1.65 : 1.5),
        bloomEnabled: true,
        bloomResolutionScale: 0.4,
        particleDrawRatio: 0.78,
        yinYangScaleFactor,
        yinYangDrawRatio: 0.9,
        ambientShaderPrecision: 'mediump',
        heroShaderPrecision: 'highp',
        gpgpuEnabled: true,
        cinemaGrainEnabled: true,
        targetFrameMs: 16.67,
      };
    }
    return {
      tier: 'THERMAL-SAFE',
      maxDpr: Math.min(profile.nativePixelRatio, 1.25),
      bloomEnabled: false,
      bloomResolutionScale: 0.35,
      particleDrawRatio: 0.58,
      yinYangScaleFactor,
      yinYangDrawRatio: 0.76,
      ambientShaderPrecision: 'mediump',
      heroShaderPrecision: 'highp',
      gpgpuEnabled: false,
      cinemaGrainEnabled: false,
      targetFrameMs: 16.67,
    };
  }

  // Desktop GPUs
  if (tier === 'HIGH') {
    return {
      tier,
      maxDpr: Math.min(profile.nativePixelRatio, 2.0),
      bloomEnabled: true,
      bloomResolutionScale: 0.75,
      particleDrawRatio: 1.0,
      yinYangScaleFactor: 1.0,
      yinYangDrawRatio: 1.0,
      ambientShaderPrecision: 'highp',
      heroShaderPrecision: 'highp',
      gpgpuEnabled: true,
      cinemaGrainEnabled: true,
      targetFrameMs: 16.67,
    };
  }
  if (tier === 'BALANCED') {
    return {
      tier,
      maxDpr: Math.min(profile.nativePixelRatio, 1.5),
      bloomEnabled: true,
      bloomResolutionScale: 0.5,
      particleDrawRatio: 0.8,
      yinYangScaleFactor: 1.0,
      yinYangDrawRatio: 0.92,
      ambientShaderPrecision: 'mediump',
      heroShaderPrecision: 'highp',
      gpgpuEnabled: true,
      cinemaGrainEnabled: true,
      targetFrameMs: 16.67,
    };
  }
  return {
    tier: 'THERMAL-SAFE',
    maxDpr: Math.min(profile.nativePixelRatio, 1.2),
    bloomEnabled: false,
    bloomResolutionScale: 0.4,
    particleDrawRatio: 0.6,
    yinYangScaleFactor: 1.0,
    yinYangDrawRatio: 0.8,
    ambientShaderPrecision: 'mediump',
    heroShaderPrecision: 'highp',
    gpgpuEnabled: false,
    cinemaGrainEnabled: false,
    targetFrameMs: 16.67,
  };
}

/**
 * Resolves the GLSL float precision tier for a given cosmic effect role.
 * Hero set pieces (Yin-Yang, Earth, Geodesic Singularity, Constellations) always stay 'highp'
 * so mobile GPU savings never degrade central visual parity.
 */
export function getShaderPrecisionForEffect(
  role: EffectPrecisionRole,
  profile: DeviceProfile,
  tier: QualityTier,
  isSoftwareGl = false,
): ShaderPrecision {
  if (role === 'hero') return 'highp';
  return getQualitySettingsForTier(tier, profile, isSoftwareGl).ambientShaderPrecision;
}

/**
 * Computes the effective WebGL canvas pixel ratio bounded cleanly to [1, settings.maxDpr]
 * based on live display density (DPR).
 */
export function resolveEffectiveDpr(
  nativeDpr: number,
  settings: Pick<QualityTierSettings, 'maxDpr'>,
): number {
  const safeNative = Number.isFinite(nativeDpr) && nativeDpr > 0 ? nativeDpr : 1;
  const bounded = clamp(Math.min(safeNative, settings.maxDpr), 1, 2);
  return Math.round(bounded * 100) / 100;
}

/**
 * Collects live browser signals safely (returns desktop defaults in SSR/Node tests).
 */
export function collectBrowserDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent: '',
      platform: '',
      maxTouchPoints: 0,
      coarsePointer: false,
      anyHover: true,
      screenWidth: 1440,
      screenHeight: 900,
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio: 1,
      prefersReducedMotion: false,
      standalone: false,
    };
  }

  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const anyHover = window.matchMedia?.('(any-hover: hover)').matches ?? !coarsePointer;
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const standalone =
    Boolean(nav.standalone) ||
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches);

  return {
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
    coarsePointer,
    anyHover,
    screenWidth: window.screen?.width || window.innerWidth,
    screenHeight: window.screen?.height || window.innerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    prefersReducedMotion,
    standalone,
  };
}

/**
 * Hysteresis-protected adaptive quality manager monitoring rolling frame times
 * so high-PPI phones & mobile Safari sustain smooth 60 FPS without oscillating
 * between tiers or overheating.
 */
export class AdaptiveQualityController {
  private tierIndex: number;
  private emaFrameMs = 16.67;
  private slowDurationSec = 0;
  private fastDurationSec = 0;
  private cooldownSec = 3.0;
  private locked: boolean;

  constructor(initialTier: QualityTier, locked = false) {
    this.tierIndex = Math.max(0, TIER_ORDER.indexOf(initialTier));
    this.locked = locked;
  }

  public getTier(): QualityTier {
    return TIER_ORDER[this.tierIndex] ?? 'BALANCED';
  }

  public setTier(tier: QualityTier): void {
    this.tierIndex = Math.max(0, TIER_ORDER.indexOf(tier));
    this.reset();
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked) {
      this.reset();
    }
  }

  public getAverageFrameMs(): number {
    return this.emaFrameMs;
  }

  public getAverageFps(): number {
    return Math.round(1000 / Math.max(8, this.emaFrameMs));
  }

  public reset(): void {
    this.emaFrameMs = 16.67;
    this.slowDurationSec = 0;
    this.fastDurationSec = 0;
    this.cooldownSec = 2.5;
  }

  /**
   * Feeds measured frame delta (in seconds). Returns the newly selected QualityTier
   * ONLY when a tier transition occurs, or null when unchanged.
   */
  public recordFrame(deltaSec: number): QualityTier | null {
    if (this.locked) return null;

    // Ignore extreme spikes caused by tab switching or system dialogs
    const clampedDelta = clamp(deltaSec, 0.004, 0.085);
    const frameMs = clampedDelta * 1000;
    this.emaFrameMs = this.emaFrameMs * 0.92 + frameMs * 0.08;

    if (this.cooldownSec > 0) {
      this.cooldownSec = Math.max(0, this.cooldownSec - clampedDelta);
      return null;
    }

    // Step down if sustained > 23ms (< ~43 FPS) for 2.2 seconds
    if (this.emaFrameMs > 23.0 && this.tierIndex < TIER_ORDER.length - 1) {
      this.slowDurationSec += clampedDelta;
      this.fastDurationSec = 0;
      if (this.slowDurationSec >= 2.2) {
        this.tierIndex += 1;
        this.slowDurationSec = 0;
        this.cooldownSec = 6.0;
        return this.getTier();
      }
      return null;
    }

    // Cautiously step back up if comfortably < 15.2ms (> 65 FPS headroom) for 8.5 seconds
    if (this.emaFrameMs < 15.2 && this.tierIndex > 0) {
      this.fastDurationSec += clampedDelta;
      this.slowDurationSec = 0;
      if (this.fastDurationSec >= 8.5) {
        this.tierIndex -= 1;
        this.fastDurationSec = 0;
        this.cooldownSec = 10.0;
        return this.getTier();
      }
      return null;
    }

    this.slowDurationSec = Math.max(0, this.slowDurationSec - clampedDelta * 0.5);
    this.fastDurationSec = Math.max(0, this.fastDurationSec - clampedDelta * 0.5);
    return null;
  }
}
