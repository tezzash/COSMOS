export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Evaluates a true 3D Bernoulli Lemniscate (figure-eight ∞) centered at the
 * binary system's Lagrange L1 equilibrium saddle (0, 0, 0), wrapping around
 * Star I at (+halfSpan * 0.68, 0, 0) and Star II at (-halfSpan * 0.68, 0, 0).
 */
export function evaluateLemniscate3D(
  theta: number,
  halfSpan: number,
  loopHeightRatio = 0.92,
  zWaveAmp = 1.65,
  out: Vec3Like = { x: 0, y: 0, z: 0 },
): Vec3Like {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const denom = 1 + s * s;
  out.x = (halfSpan * c) / denom;
  out.y = ((halfSpan * s * c) / denom) * loopHeightRatio;
  out.z = Math.sin(2 * theta) * zWaveAmp;
  return out;
}

/**
 * Analytical divergence-free 3D curl-noise velocity field (∇ × ψ):
 * Guaranteed mathematically solenoidal (∇ · v = 0) so plasma filaments swirl
 * like magnetized stellar wind without clumping or collapsing.
 *
 * Vector potential ψ = (ψ_x, ψ_y, ψ_z) with spatially separable trigonometric modes:
 *   ψ_x = sin(ky*y + t) * cos(kz*z - t*0.7)
 *   ψ_y = sin(kz*z + t*0.8) * cos(kx*x + t*0.6)
 *   ψ_z = sin(kx*x - t*0.9) * cos(ky*y + t*0.5)
 * Curl v = (∂ψ_z/∂y - ∂ψ_y/∂z, ∂ψ_x/∂z - ∂ψ_z/∂x, ∂ψ_y/∂x - ∂ψ_x/∂y).
 */
export function sampleDivergenceFreeCurl3D(
  x: number,
  y: number,
  z: number,
  time: number,
  freq = 0.24,
  out: Vec3Like = { x: 0, y: 0, z: 0 },
): Vec3Like {
  const kx = freq;
  const ky = freq * 1.07;
  const kz = freq * 0.93;

  const ax = kx * x;
  const ay = ky * y;
  const az = kz * z;

  const dPsiz_dy = -ky * Math.sin(ax - time * 0.9) * Math.sin(ay + time * 0.5);
  const dPsiy_dz = kz * Math.cos(az + time * 0.8) * Math.cos(ax + time * 0.6);

  const dPsix_dz = -kz * Math.sin(ay + time) * Math.sin(az - time * 0.7);
  const dPsiz_dx = kx * Math.cos(ax - time * 0.9) * Math.cos(ay + time * 0.5);

  const dPsiy_dx = -kx * Math.sin(az + time * 0.8) * Math.sin(ax + time * 0.6);
  const dPsix_dy = ky * Math.cos(ay + time) * Math.cos(az - time * 0.7);

  // Normalize by freq so output amplitude is ~O(1) regardless of spatial scale
  const invF = 1 / Math.max(0.001, freq);
  out.x = (dPsiz_dy - dPsiy_dz) * invF;
  out.y = (dPsix_dz - dPsiz_dx) * invF;
  out.z = (dPsiy_dx - dPsix_dy) * invF;
  return out;
}

/**
 * Dedicated CPU-backed / GPU-streamed Curl-Noise Figure-Eight Plasma Buffer:
 * Drives thousands of glowing plasma motes continuously in an endless ∞ figure-eight
 * around the binary star system, perturbed by divergence-free 3D curl eddies.
 */
export class FigureEightCurlBuffer {
  public readonly count: number;
  public readonly positions: Float32Array;
  public readonly colors: Float32Array;
  public readonly scales: Float32Array;
  public readonly phases: Float32Array;

  private readonly baseAngles: Float32Array;
  private readonly speeds: Float32Array;
  private readonly tubeOffsetsY: Float32Array;
  private readonly tubeOffsetsZ: Float32Array;
  private readonly curlAmps: Float32Array;
  private readonly tempPos: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly tempCurl: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(count: number, seedStart = 25112002) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.scales = new Float32Array(count);
    this.phases = new Float32Array(count);

    this.baseAngles = new Float32Array(count);
    this.speeds = new Float32Array(count);
    this.tubeOffsetsY = new Float32Array(count);
    this.tubeOffsetsZ = new Float32Array(count);
    this.curlAmps = new Float32Array(count);

    let seed = seedStart >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      this.baseAngles[i] = rand() * Math.PI * 2;
      // Dual counter-flowing plasma streams along the figure-eight to emphasize equilibrium
      const dir = i % 3 === 0 ? -1 : 1;
      this.speeds[i] = dir * (0.28 + rand() * 0.34);

      // Gaussian-like cross-section spread around the ∞ ribbon core
      const rSpread = Math.pow(rand(), 1.65) * 1.45;
      const aSpread = rand() * Math.PI * 2;
      this.tubeOffsetsY[i] = Math.cos(aSpread) * rSpread;
      this.tubeOffsetsZ[i] = Math.sin(aSpread) * rSpread;

      this.curlAmps[i] = 0.35 + rand() * 0.95;
      this.scales[i] = 1.15 + Math.pow(rand(), 1.7) * 2.9;
      this.phases[i] = rand();
    }

    // Initialize valid buffer state at rest
    this.update(0, 12.2, 1.0, 0.0);
  }

  /**
   * Evolves the figure-eight plasma stream & 3D curl-noise displacement buffer in-place
   * (zero per-frame heap allocations).
   */
  public update(
    elapsed: number,
    halfSpan: number,
    converge: number,
    dissolve: number,
  ): void {
    const pos = this.positions;
    const col = this.colors;
    const n = this.count;
    const curlScale = 0.52 + (1 - converge) * 0.65 + dissolve * 1.35;
    const loopHeightRatio = 0.88 + 0.14 * converge;
    const zWave = 1.65 + dissolve * 2.2;

    for (let i = 0; i < n; i++) {
      const theta = this.baseAngles[i] + elapsed * this.speeds[i];
      const base = evaluateLemniscate3D(theta, halfSpan, loopHeightRatio, zWave, this.tempPos);

      // Pinch cross-section gracefully as plasma funnels through Lagrange L1 (x ≈ 0)
      const xNorm = Math.min(1, Math.abs(base.x) / Math.max(0.5, halfSpan));
      const waist = 0.32 + 0.68 * xNorm;

      const bx = base.x;
      const by = base.y + this.tubeOffsetsY[i] * waist;
      const bz = base.z + this.tubeOffsetsZ[i] * waist;

      const curl = sampleDivergenceFreeCurl3D(bx, by, bz, elapsed * 0.55, 0.23, this.tempCurl);
      const amp = this.curlAmps[i] * curlScale * (0.45 + 0.55 * xNorm);

      const px = bx + curl.x * amp;
      const py = by + curl.y * amp;
      const pz = bz + curl.z * amp;

      const idx = i * 3;
      pos[idx] = px;
      pos[idx + 1] = py;
      pos[idx + 2] = pz;

      // Dynamic harmonic color grading:
      // +X lobe (Golden Sovereign) -> solar gold (#f7d082)
      // L1 center (x ≈ 0) -> incandescent pearl-white (#fff8ec)
      // -X lobe (Sapphire-Violet Dreamer) -> electric sapphire-violet (#7584f7)
      const sideMix = Math.max(0, Math.min(1, (px / Math.max(1, halfSpan)) * 0.62 + 0.5));
      const l1Hot = Math.exp(-Math.pow(px / (halfSpan * 0.22), 2));

      const rBase = 0.44 + (0.98 - 0.44) * sideMix;
      const gBase = 0.50 + (0.80 - 0.50) * sideMix;
      const bBase = 0.98 + (0.46 - 0.98) * sideMix;

      col[idx] = rBase + (1.0 - rBase) * l1Hot * 0.68;
      col[idx + 1] = gBase + (0.97 - gBase) * l1Hot * 0.68;
      col[idx + 2] = bBase + (0.92 - bBase) * l1Hot * 0.68;
    }
  }
}
