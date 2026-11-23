import { clamp } from '@/data/chapters';
import type { EnvQualityOverride } from '@/utils/env';

export type QualityTier = 'HIGH' | 'BALANCED' | 'THERMAL-SAFE';

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
  gpgpuEnabled: boolean;
  cinemaGrainEnabled: boolean;
  targetFrameMs: number;
}

const TIER_ORDER: readonly QualityTier[] = ['HIGH', 'BALANCED', 'THERMAL-SAFE'];

/**
 * Reliable multi-signal mobile, iOS Safari, and iPhone 17 Pro Max detection.
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
      // Apple A19 Pro handles HIGH cleanly when DPR is capped intelligently below 3x native
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
    isStandaloneWebApp: Boolean(signals.standalone),
    prefersReducedMotion: signals.prefersReducedMotion,
    nativePixelRatio: dpr,
    // Lock mobile / iOS ProMotion to a serene 60 FPS ceiling to eliminate thermal throttling
    targetFps: isMobile || isIOS ? 60 : 60,
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
      gpgpuEnabled: false,
      cinemaGrainEnabled: false,
      targetFrameMs: 16.67,
    };
  }

  if (profile.isMobile || profile.isIOS) {
    // Intelligent DPR caps for 2868x1320 (3x) ProMotion OLED:
    // 2.0x on HIGH delivers ~1912x880 razor-sharp HDR with less than half the fragment fill of 3x!
    if (tier === 'HIGH') {
      return {
        tier,
        maxDpr: Math.min(profile.nativePixelRatio, profile.isIPhoneProMaxClass ? 2.0 : 1.75),
        bloomEnabled: true,
        bloomResolutionScale: 0.5,
        particleDrawRatio: 1.0,
        gpgpuEnabled: true,
        cinemaGrainEnabled: true,
        targetFrameMs: 16.67,
      };
    }
    if (tier === 'BALANCED') {
      return {
        tier,
        maxDpr: Math.min(profile.nativePixelRatio, 1.55),
        bloomEnabled: true,
        bloomResolutionScale: 0.4,
        particleDrawRatio: 0.78,
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
    gpgpuEnabled: false,
    cinemaGrainEnabled: false,
    targetFrameMs: 16.67,
  };
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
 * so iPhone 17 Pro Max & mobile Safari sustain smooth 60 FPS without oscillating
 * between tiers or overheating.
 */
export class AdaptiveQualityController {
  private tierIndex: number;
  private emaFrameMs = 16.67;
  private slowDurationSec = 0;
  private fastDurationSec = 0;
  private cooldownSec = 3.0;
  private readonly locked: boolean;

  constructor(initialTier: QualityTier, locked = false) {
    this.tierIndex = Math.max(0, TIER_ORDER.indexOf(initialTier));
    this.locked = locked;
  }

  public getTier(): QualityTier {
    return TIER_ORDER[this.tierIndex] ?? 'BALANCED';
  }

  public getAverageFrameMs(): number {
    return this.emaFrameMs;
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
