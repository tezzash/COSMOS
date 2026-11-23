export type EnvQualityOverride = 'auto' | 'high' | 'balanced' | 'thermal-safe';

export interface AppEnvConfig {
  revealAudioUrl: string | null;
  qualityTierOverride: EnvQualityOverride;
  warnings: string[];
}

const VALID_QUALITY_OVERRIDES = new Set<string>(['auto', 'high', 'balanced', 'thermal-safe']);

function isSafeAudioUrl(raw: string): boolean {
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return true;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Parses and validates optional Vite runtime environment variables safely.
 * Missing or invalid values fall back cleanly to safe defaults and never throw.
 */
export function parseAppEnv(
  rawEnv: Record<string, unknown> | undefined | null,
): AppEnvConfig {
  const warnings: string[] = [];
  const env = rawEnv ?? {};

  let revealAudioUrl: string | null = null;
  const rawRevealUrl = typeof env.VITE_REVEAL_AUDIO_URL === 'string'
    ? env.VITE_REVEAL_AUDIO_URL.trim()
    : '';
  if (rawRevealUrl.length > 0) {
    if (isSafeAudioUrl(rawRevealUrl)) {
      revealAudioUrl = rawRevealUrl;
    } else {
      warnings.push('Invalid VITE_REVEAL_AUDIO_URL ignored; using procedural score.');
    }
  }

  let qualityTierOverride: EnvQualityOverride = 'auto';
  const rawQuality = typeof env.VITE_QUALITY_TIER === 'string'
    ? env.VITE_QUALITY_TIER.trim().toLowerCase()
    : '';
  if (rawQuality.length > 0) {
    if (VALID_QUALITY_OVERRIDES.has(rawQuality)) {
      qualityTierOverride = rawQuality as EnvQualityOverride;
    } else {
      warnings.push(`Invalid VITE_QUALITY_TIER "${rawQuality}" ignored; defaulting to auto.`);
    }
  }

  return {
    revealAudioUrl,
    qualityTierOverride,
    warnings,
  };
}

let cachedEnv: AppEnvConfig | null = null;

export function getAppEnv(): AppEnvConfig {
  if (!cachedEnv) {
    const metaEnv =
      typeof import.meta !== 'undefined' && import.meta.env
        ? (import.meta.env as Record<string, unknown>)
        : {};
    cachedEnv = parseAppEnv(metaEnv);
  }
  return cachedEnv;
}
