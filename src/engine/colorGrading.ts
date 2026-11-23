import { SILENCE_END, SILENCE_START, clamp, smoothstep } from '../data/chapters';

export type FilmLutId = 'cosmosCool' | 'etherealViolet' | 'kodak2383Warm';

export interface ChapterLutWeights {
  cosmosCool: number;
  etherealViolet: number;
  kodak2383Warm: number;
  activeLabel: FilmLutId;
}

export const LUT_SIZE = 32;

/**
 * Computes smooth cross-faded 3D film-print LUT blend weights across the 7 chapters:
 * - Prologue & Chapter I (Orbital Space): Cool tungsten/cobalt shadow toe (ACEScg -> cool cinema)
 * - Chapter II, III, IV (Sagittarius, Network, Yin-Yang): Ethereal deep-violet/gold harmonic print
 * - Chapter V (Quiet Hours) & Final Reveal: Warm Kodak 2383 golden-amber midtone film print
 */
export function computeChapterLutWeights(filmTime: number): ChapterLutWeights {
  const t = clamp(filmTime, 0, 405);

  // Ethereal violet peaks cleanly across Chapters II, III & IV (108s..285s)
  const violetIn = smoothstep(106, 120, t);
  const violetOut = 1 - smoothstep(276, 290, t);
  const rawViolet = violetIn * violetOut * 0.88;

  // Kodak 2383 Warm Golden-Amber dominates Chapter V (Quiet Hours 285..335) and Final Reveal (371..405)
  const quietWarm = smoothstep(278, 292, t) * (1 - smoothstep(334, 348, t));
  const revealWarm = smoothstep(SILENCE_END - 0.5, SILENCE_END + 3.5, t);
  const sunriseHint = smoothstep(70, 82, t) * (1 - smoothstep(98, 108, t)) * 0.24;
  const rawWarm = clamp(Math.max(quietWarm, revealWarm, sunriseHint), 0, 1);

  // Cool tungsten/cobalt anchors Prologue, Earth orbit, and Final Convergence silence
  const silenceCool = smoothstep(340, 355, t) * (1 - smoothstep(SILENCE_END - 0.2, SILENCE_END + 1.5, t));
  const rawCool = clamp(Math.max(1 - rawViolet - rawWarm, silenceCool * 0.82), 0.04, 1);

  const sum = rawCool + rawViolet + rawWarm;
  const cosmosCool = rawCool / sum;
  const etherealViolet = rawViolet / sum;
  const kodak2383Warm = rawWarm / sum;

  let activeLabel: FilmLutId = 'cosmosCool';
  if (kodak2383Warm >= cosmosCool && kodak2383Warm >= etherealViolet) {
    activeLabel = 'kodak2383Warm';
  } else if (etherealViolet >= cosmosCool && etherealViolet >= kodak2383Warm) {
    activeLabel = 'etherealViolet';
  }

  return { cosmosCool, etherealViolet, kodak2383Warm, activeLabel };
}

/**
 * Film-print S-curve contrast shaping (preserves obsidian shadow toe without crushing highlights).
 */
function filmPrintCurve(v: number, toeStrength: number, shoulderSoft: number): number {
  const x = clamp(v, 0, 1);
  // Subtle filmic S-curve with gentle shadow toe compression
  const s = x * x * (3 - 2 * x);
  const blended = x * (1 - toeStrength) + s * toeStrength;
  // Soft highlight shoulder roll-off
  return clamp(blended * (1 - shoulderSoft * 0.08 * blended * blended), 0, 1);
}

/**
 * Bakes a 32x32x32 RGBA Uint8Array 3D Color Grading LUT cube (ACEScg -> Kodak 2383 cinema print).
 * Index layout matches WebGL2 Data3DTexture: ((b * size + g) * size + r) * 4.
 */
export function bakeFilmPrintLutData(preset: FilmLutId, size = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const inv = 1 / Math.max(1, size - 1);

  for (let bIdx = 0; bIdx < size; bIdx++) {
    const b0 = bIdx * inv;
    for (let gIdx = 0; gIdx < size; gIdx++) {
      const g0 = gIdx * inv;
      for (let rIdx = 0; rIdx < size; rIdx++) {
        const r0 = rIdx * inv;

        // 1. Filmic print tone curve
        const toe = preset === 'cosmosCool' ? 0.16 : preset === 'kodak2383Warm' ? 0.14 : 0.15;
        let r = filmPrintCurve(r0, toe, 0.35);
        let g = filmPrintCurve(g0, toe, 0.35);
        let b = filmPrintCurve(b0, toe, 0.35);

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Shadow / midtone / highlight zone masks (zero lift at pure obsidian black luma == 0!)
        const nonBlack = smoothstep(0.015, 0.08, luma);
        const shadowMask = (1 - smoothstep(0.06, 0.42, luma)) * nonBlack;
        const midMask = Math.sin(clamp(luma, 0, 1) * Math.PI);
        const hiMask = smoothstep(0.55, 0.96, luma);

        if (preset === 'cosmosCool') {
          // Cool tungsten/cobalt shadow toe, crisp astronomical white highlights
          r += shadowMask * -0.014 + midMask * -0.004 + hiMask * 0.008;
          g += shadowMask * -0.003 + midMask * 0.003 + hiMask * 0.004;
          b += shadowMask * 0.026 + midMask * 0.012 + hiMask * -0.006;
        } else if (preset === 'etherealViolet') {
          // Deep indigo-violet shadows paired with restrained champagne-gold midtones
          r += shadowMask * 0.006 + midMask * 0.016 + hiMask * 0.012;
          g += shadowMask * -0.008 + midMask * 0.004 + hiMask * 0.004;
          b += shadowMask * 0.024 + midMask * 0.006 + hiMask * -0.010;
        } else {
          // Kodak 2383 warm print: subtle teal-slate shadow anchor + rich golden-amber midtones & creamy highlights
          r += shadowMask * -0.008 + midMask * 0.032 + hiMask * 0.018;
          g += shadowMask * 0.002 + midMask * 0.014 + hiMask * 0.006;
          b += shadowMask * 0.014 + midMask * -0.024 + hiMask * -0.020;
        }

        // Restrained theatrical highlight desaturation (film dye roll-off)
        const gradedLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const satFactor = 1.0 - hiMask * 0.14;
        r = clamp(gradedLuma + (r - gradedLuma) * satFactor, 0, 1);
        g = clamp(gradedLuma + (g - gradedLuma) * satFactor, 0, 1);
        b = clamp(gradedLuma + (b - gradedLuma) * satFactor, 0, 1);

        const offset = ((bIdx * size + gIdx) * size + rIdx) * 4;
        data[offset] = Math.round(r * 255);
        data[offset + 1] = Math.round(g * 255);
        data[offset + 2] = Math.round(b * 255);
        data[offset + 3] = 255;
      }
    }
  }

  return data;
}
