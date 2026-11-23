import { clamp, smoothstep } from '../data/chapters';

export interface SagittariusStar {
  id: string;
  name: string;
  pos: readonly [number, number, number];
  /** Apparent brightness weight [0.55..1.55] */
  magnitude: number;
  /** Hex spectral color tint (B/A blue-white to G/K warm gold) */
  colorHex: number;
}

export interface SagittariusEdge {
  from: number;
  to: number;
  /** 'arrow' | 'bow' | 'teapot' | 'crown' | 'string' */
  group: 'arrow' | 'bow' | 'teapot' | 'crown' | 'string';
}

export interface SagittariusEdgeState {
  from: number;
  to: number;
  group: SagittariusEdge['group'];
  /** 0 = hidden, 0..1 = actively drawing from->to, 1 = fully connected */
  progress: number;
  isDrawing: boolean;
}

export interface SagittariusStarState {
  /** 0 = dormant faint background star, 1 = fully ignited constellation star */
  lit: number;
  /** 0..1 crisp ignition burst flash when the star first connects */
  flash: number;
}

export interface SagittariusFrameState {
  edges: SagittariusEdgeState[];
  stars: SagittariusStarState[];
  completedEdges: number;
  activeEdgeIndex: number;
  litStarCount: number;
  /** World-local position of the currently drawing leading spark, or null when idle */
  sparkPos: [number, number, number] | null;
  /** 0..1 overall completion progress of the Sagittarius drawing sequence */
  overallProgress: number;
}

/** Chapter II sequential drawing window (seconds) */
export const SAGITTARIUS_DRAW_START = 111.5;
export const SAGITTARIUS_DRAW_END = 155.5;

/**
 * Authentic Sagittarius constellation stars (Archer's drawn Bow, Arrow aimed skyward,
 * Teapot asterism core, and celestial crown/legs) arranged in 3D space with subtle
 * Z-depth for cinematic orbital parallax.
 */
export const SAGITTARIUS_STARS: readonly SagittariusStar[] = [
  // 0..5: The Arrow & Sweeping Archer's Bow
  { id: 'kaus-media', name: 'Kaus Media (δ Sgr)', pos: [1.55, 0.75, 0.38], magnitude: 1.35, colorHex: 0xffe4ad },
  { id: 'x-sgr', name: 'Arrow Shaft (X Sgr)', pos: [3.45, 1.45, 0.48], magnitude: 0.82, colorHex: 0xf6d591 },
  { id: 'alnasl', name: 'Alnasl (γ2 Sgr)', pos: [5.35, 2.15, 0.58], magnitude: 1.42, colorHex: 0xfff5dc },
  { id: 'arrow-barb-up', name: 'Upper Tip Star', pos: [4.18, 2.48, 0.44], magnitude: 0.72, colorHex: 0xffe4ad },
  { id: 'arrow-barb-dn', name: 'Lower Tip Star', pos: [4.48, 1.08, 0.46], magnitude: 0.72, colorHex: 0xffe4ad },
  { id: 'kaus-borealis', name: 'Kaus Borealis (λ Sgr)', pos: [-0.2, 3.25, 0.24], magnitude: 1.24, colorHex: 0xffd78c },
  { id: 'mu-sgr', name: 'Polis (μ Sgr)', pos: [-1.95, 4.75, -0.12], magnitude: 1.02, colorHex: 0xcfe0ff },
  { id: 'kaus-australis', name: 'Kaus Australis (ε Sgr)', pos: [2.25, -2.55, 0.22], magnitude: 1.52, colorHex: 0xdceaff },
  { id: 'eta-sgr', name: 'Eta Sgr (η Sgr)', pos: [1.15, -4.55, -0.16], magnitude: 0.96, colorHex: 0xffc985 },

  // 9..12: Classic Teapot Body & Handle (Archer's chest & drawing arm)
  { id: 'phi-sgr', name: 'Phi Sgr (φ Sgr)', pos: [-1.05, 1.15, 0.12], magnitude: 1.06, colorHex: 0xd8e6ff },
  { id: 'ascella', name: 'Ascella (ζ Sgr)', pos: [-0.45, -2.1, 0.18], magnitude: 1.22, colorHex: 0xf4f7ff },
  { id: 'nunki', name: 'Nunki (σ Sgr)', pos: [-2.75, -0.55, -0.06], magnitude: 1.48, colorHex: 0xb9d6ff },
  { id: 'tau-sgr', name: 'Tau Sgr (τ Sgr)', pos: [-3.25, -2.45, -0.18], magnitude: 1.05, colorHex: 0xf5ca7e },

  // 13..19: Archer's Crown, Flowing Cloak & Celestial Stance
  { id: 'xi2-sgr', name: 'Xi2 Sgr (ξ2 Sgr)', pos: [-2.25, 3.05, -0.08], magnitude: 0.85, colorHex: 0xf4d8a2 },
  { id: 'omicron-sgr', name: 'Omicron Sgr (ο Sgr)', pos: [-3.45, 2.85, -0.2], magnitude: 0.88, colorHex: 0xffe2a8 },
  { id: 'pi-sgr', name: 'Albaldah (π Sgr)', pos: [-4.55, 2.05, -0.28], magnitude: 1.15, colorHex: 0xfff0d1 },
  { id: 'psi-sgr', name: 'Psi Sgr (ψ Sgr)', pos: [-4.75, 0.25, -0.32], magnitude: 0.78, colorHex: 0xcbdcff },
  { id: 'omega-sgr', name: 'Omega Sgr (ω Sgr)', pos: [-5.55, -2.05, -0.34], magnitude: 0.82, colorHex: 0xf0d5a4 },
  { id: 'rukbat', name: 'Rukbat (α Sgr)', pos: [-2.85, -4.65, 0.08], magnitude: 0.94, colorHex: 0xc6ddff },
  { id: 'arkab', name: 'Arkab (β1 Sgr)', pos: [-0.85, -4.85, 0.2], magnitude: 0.9, colorHex: 0xd4e4ff },
] as const;

/**
 * Ordered star-by-star drawing choreography:
 * 1. The Heart & Skyward Arrow ignite first (aiming high)
 * 2. The sweeping Archer's Bow arcs above & below
 * 3. The classic Teapot core & drawing hand (Nunki) lock into place
 * 4. The taut bowstring pulls back to Nunki
 * 5. The celestial crown, cloak & stance complete Sagittarius
 */
export const SAGITTARIUS_EDGES: readonly SagittariusEdge[] = [
  // Phase 1: The Arrow aimed toward the heavens
  { from: 11, to: 0, group: 'arrow' },   // Nunki (nock) -> Kaus Media (bow grip)
  { from: 0, to: 1, group: 'arrow' },    // Kaus Media -> Arrow mid
  { from: 1, to: 2, group: 'arrow' },    // Arrow mid -> Alnasl (arrowhead)
  { from: 2, to: 3, group: 'arrow' },    // Alnasl -> Upper arrowhead barb
  { from: 2, to: 4, group: 'arrow' },    // Alnasl -> Lower arrowhead barb

  // Phase 2: The Sweeping Archer's Bow
  { from: 0, to: 5, group: 'bow' },      // Kaus Media -> Kaus Borealis (upper bow)
  { from: 5, to: 6, group: 'bow' },      // Kaus Borealis -> Polis / Mu Sgr (upper bow tip)
  { from: 0, to: 7, group: 'bow' },      // Kaus Media -> Kaus Australis (lower bow)
  { from: 7, to: 8, group: 'bow' },      // Kaus Australis -> Eta Sgr (lower bow tip)

  // Phase 3: The Teapot Asterism Core & Handle
  { from: 5, to: 9, group: 'teapot' },   // Kaus Borealis -> Phi Sgr (lid)
  { from: 0, to: 9, group: 'teapot' },   // Kaus Media -> Phi Sgr
  { from: 9, to: 10, group: 'teapot' },  // Phi Sgr -> Ascella
  { from: 7, to: 10, group: 'teapot' },  // Kaus Australis -> Ascella (base)
  { from: 9, to: 11, group: 'teapot' },  // Phi Sgr -> Nunki (upper handle)
  { from: 11, to: 12, group: 'teapot' }, // Nunki -> Tau Sgr (handle bend)
  { from: 12, to: 10, group: 'teapot' }, // Tau Sgr -> Ascella (lower handle)

  // Phase 4: The Taut Drawn Bowstring
  { from: 6, to: 11, group: 'string' },  // Upper bow tip -> Nunki
  { from: 11, to: 8, group: 'string' },  // Nunki -> Lower bow tip

  // Phase 5: The Archer's Celestial Crown, Cloak & Stance
  { from: 5, to: 13, group: 'crown' },   // Kaus Borealis -> Xi2 Sgr
  { from: 13, to: 14, group: 'crown' },  // Xi2 Sgr -> Omicron Sgr
  { from: 14, to: 15, group: 'crown' },  // Omicron Sgr -> Albaldah (Pi Sgr)
  { from: 15, to: 16, group: 'crown' },  // Albaldah -> Psi Sgr
  { from: 16, to: 17, group: 'crown' },  // Psi Sgr -> Omega Sgr
  { from: 12, to: 18, group: 'crown' },  // Tau Sgr -> Rukbat (Alpha Sgr)
  { from: 18, to: 19, group: 'crown' },  // Rukbat -> Arkab (Beta1 Sgr)
  { from: 19, to: 8, group: 'crown' },   // Arkab -> Eta Sgr
] as const;

/**
 * Pure deterministic evaluator for Sagittarius's sequential star-by-star connection.
 * Each edge draws strictly one after another with cubic ease-out motion, igniting
 * each star with a crisp astronomical flash upon arrival.
 */
export function evaluateSagittariusState(filmTime: number): SagittariusFrameState {
  const totalEdges = SAGITTARIUS_EDGES.length;
  const totalSpan = SAGITTARIUS_DRAW_END - SAGITTARIUS_DRAW_START;
  const stepDuration = totalSpan / totalEdges;

  const overallProgress = clamp((filmTime - SAGITTARIUS_DRAW_START) / totalSpan, 0, 1);

  const starLit = new Float32Array(SAGITTARIUS_STARS.length);
  const starFlash = new Float32Array(SAGITTARIUS_STARS.length);

  // First anchor star (Nunki, origin of edge 0) wakes slightly before the first beam departs
  const firstWake = smoothstep(SAGITTARIUS_DRAW_START - 0.8, SAGITTARIUS_DRAW_START + 0.15, filmTime);
  if (firstWake > 0) {
    const originIdx = SAGITTARIUS_EDGES[0].from;
    starLit[originIdx] = firstWake;
    const age = Math.max(0, filmTime - (SAGITTARIUS_DRAW_START - 0.5));
    starFlash[originIdx] = firstWake * Math.exp(-age * 2.8);
  }

  const edges: SagittariusEdgeState[] = [];
  let completedEdges = 0;
  let activeEdgeIndex = -1;
  let sparkPos: [number, number, number] | null = null;

  for (let i = 0; i < totalEdges; i++) {
    const edge = SAGITTARIUS_EDGES[i];
    const startT = SAGITTARIUS_DRAW_START + i * stepDuration;
    const endT = startT + stepDuration * 0.92; // brief rhythmic beat before next line launches

    const rawP = clamp((filmTime - startT) / Math.max(0.001, endT - startT), 0, 1);
    // Smooth ease-out cubic so each star-beam launches swiftly and docks cleanly at the target star
    const easedP = 1 - Math.pow(1 - rawP, 3);
    const isDrawing = rawP > 0 && rawP < 1;

    if (rawP >= 1) {
      completedEdges++;
    }
    if (isDrawing) {
      activeEdgeIndex = i;
      const a = SAGITTARIUS_STARS[edge.from].pos;
      const b = SAGITTARIUS_STARS[edge.to].pos;
      sparkPos = [
        a[0] + (b[0] - a[0]) * easedP,
        a[1] + (b[1] - a[1]) * easedP,
        a[2] + (b[2] - a[2]) * easedP,
      ];
    }

    // Source star lights when beam starts
    if (rawP > 0) {
      starLit[edge.from] = Math.max(starLit[edge.from], smoothstep(0, 0.18, rawP));
    }

    // Destination star ignites with a crisp flash as the beam arrives
    if (rawP >= 0.88) {
      const arrival = smoothstep(0.88, 1.0, rawP);
      starLit[edge.to] = Math.max(starLit[edge.to], arrival);
      const postArrivalAge = Math.max(0, filmTime - endT);
      const flashVal = arrival * Math.exp(-postArrivalAge * 3.1);
      starFlash[edge.to] = Math.max(starFlash[edge.to], flashVal);
    }

    edges.push({
      from: edge.from,
      to: edge.to,
      group: edge.group,
      progress: easedP,
      isDrawing,
    });
  }

  const stars: SagittariusStarState[] = [];
  let litStarCount = 0;
  for (let i = 0; i < SAGITTARIUS_STARS.length; i++) {
    if (starLit[i] >= 0.5) litStarCount++;
    stars.push({
      lit: starLit[i],
      flash: starFlash[i],
    });
  }

  return {
    edges,
    stars,
    completedEdges,
    activeEdgeIndex,
    litStarCount,
    sparkPos,
    overallProgress,
  };
}
