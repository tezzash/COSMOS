import { clamp, smoothstep } from '../data/chapters';

export interface EclipseShadowResult {
  /** Direct solar illumination factor [0 = full umbra, 1 = full sunlight] */
  sunFactor: number;
  /** Copper-red refracted twilight glow at the umbra/penumbra boundary [0..1] */
  copperRim: number;
  /** Soft sapphire Earthshine illumination on shadowed surfaces [0..1] */
  earthshine: number;
}

/**
 * Pure analytical planetary eclipse shadow calculation (Earth casting umbra & penumbra
 * cones onto the Moon, astrolabe rings, and orbital dust along the anti-solar axis).
 *
 * Uses the exact angular overlap geometry of the occluding planet and solar disc.
 */
export function computePlanetaryEclipse(
  point: readonly [number, number, number],
  occluderCenter: readonly [number, number, number],
  occluderRadius: number,
  sunDir: readonly [number, number, number],
  sunAngularRadius = 0.06,
): EclipseShadowResult {
  const dx = point[0] - occluderCenter[0];
  const dy = point[1] - occluderCenter[1];
  const dz = point[2] - occluderCenter[2];

  // Normalize sunDir
  const sLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
  const sx = sunDir[0] / sLen;
  const sy = sunDir[1] / sLen;
  const sz = sunDir[2] / sLen;

  // Projection along sun vector: negative means point is behind the planet relative to the Sun
  const alongSun = dx * sx + dy * sy + dz * sz;
  if (alongSun >= 0) {
    return { sunFactor: 1, copperRim: 0, earthshine: 0 };
  }

  const distBehind = -alongSun;
  // Perpendicular distance from the anti-solar shadow axis
  const px = dx - alongSun * sx;
  const py = dy - alongSun * sy;
  const pz = dz - alongSun * sz;
  const perpDist = Math.hypot(px, py, pz);

  // Softened umbra (shrinking slightly with distance) and penumbra (expanding with distance)
  const penumbraExpand = distBehind * sunAngularRadius;
  const umbraRadius = Math.max(0.05, occluderRadius - penumbraExpand * 0.65);
  const penumbraRadius = occluderRadius + penumbraExpand * 1.15;

  const sunFactor = smoothstep(umbraRadius, penumbraRadius, perpDist);
  const shadowAmount = 1 - sunFactor;

  // Copper-red atmospheric refraction peak right along the penumbra transition edge
  const edgePos = clamp(
    (perpDist - umbraRadius) / Math.max(0.001, penumbraRadius - umbraRadius),
    0,
    1,
  );
  const copperRim = Math.sin(edgePos * Math.PI) * (perpDist <= penumbraRadius ? 1 : 0);

  // Subtle blue-silver Earthshine fading gently with orbital distance
  const distFalloff = clamp(1.0 / (1.0 + (distBehind / Math.max(1, occluderRadius * 2.4)) ** 2), 0.08, 1.0);
  const earthshine = shadowAmount * distFalloff;

  return { sunFactor, copperRim, earthshine };
}

/**
 * Shared GLSL analytical planetary eclipse shadow snippet matching computePlanetaryEclipse().
 * Returns vec3(sunFactor, copperRim, earthshine).
 */
export const GLSL_PLANETARY_ECLIPSE = /* glsl */ `
  vec3 computePlanetaryEclipse(vec3 worldPos, vec3 occluderCenter, float occluderRadius, vec3 sunDir) {
    vec3 rel = worldPos - occluderCenter;
    vec3 L = normalize(sunDir);
    float alongSun = dot(rel, L);
    if (alongSun >= 0.0) {
      return vec3(1.0, 0.0, 0.0);
    }
    float distBehind = -alongSun;
    vec3 perpVec = rel - alongSun * L;
    float perpDist = length(perpVec);

    float penumbraExpand = distBehind * 0.068;
    float umbraRadius = max(0.05, occluderRadius - penumbraExpand * 0.65);
    float penumbraRadius = occluderRadius + penumbraExpand * 1.15;

    float sunFactor = smoothstep(umbraRadius, penumbraRadius, perpDist);
    float shadowAmt = 1.0 - sunFactor;
    float edgeT = clamp((perpDist - umbraRadius) / max(0.001, penumbraRadius - umbraRadius), 0.0, 1.0);
    float copperRim = sin(edgeT * 3.14159265) * step(perpDist, penumbraRadius);
    float distRatio = distBehind / max(1.0, occluderRadius * 2.4);
    float earthshine = shadowAmt / (1.0 + distRatio * distRatio);
    return vec3(sunFactor, copperRim, clamp(earthshine, 0.0, 1.0));
  }
`;
