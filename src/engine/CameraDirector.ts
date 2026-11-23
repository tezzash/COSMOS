import * as THREE from 'three';
import { CHAPTERS, FILM_DURATION, SILENCE_START, clamp, smoothstep } from '@/data/chapters';

interface CameraKeyframe {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

/**
 * Continuous cinematic camera path across the entire 405-second cosmic journey.
 * Zero hard cuts: every chapter flows organically along the -Z cosmic corridor
 * with motivated orbits, subtle handheld cinema breathing, and an intentional
 * slow push-in across the final 32 seconds during the emotional closing words.
 */
const KEYFRAMES: readonly CameraKeyframe[] = [
  // PROLOGUE (0..55): Singularity -> Big Bang expansion -> spiral galaxy dive
  { t: 0, pos: [0, 0.3, 18], look: [0, 0, 0], fov: 48 },
  { t: 10, pos: [1.5, 0.8, 28], look: [0, 0, 0], fov: 52 },
  { t: 25, pos: [6.5, 3.2, 34], look: [0, 0.5, -8], fov: 54 },
  { t: 42, pos: [3.2, 2.2, 10], look: [-2, 0.5, -45], fov: 52 },
  { t: 54, pos: [-8, 4.5, -46], look: [-6, 1.5, -86], fov: 48 },

  // CHAPTER I (55..110): Sun -> Earth approach -> Hyderabad sunrise -> upper atmosphere star
  { t: 62, pos: [-16, 6.2, -62], look: [0, 0, -90], fov: 45 },
  { t: 76, pos: [9.5, 3.8, -68], look: [0.5, 0.5, -90], fov: 44 },
  { t: 92, pos: [11.2, 2.6, -77.5], look: [1.5, 1.2, -90], fov: 42 },
  { t: 106, pos: [5.0, 5.2, -108], look: [0, 3.5, -155], fov: 46 },

  // CHAPTER II (110..175): Graceful orbital framing of sequential Sagittarius constellation & symbolic 3D motifs
  { t: 118, pos: [0, 4.3, -146], look: [0, 4.5, -175], fov: 46 },
  { t: 136, pos: [8.5, 5.2, -149], look: [0, 4.5, -175], fov: 45 },
  { t: 155, pos: [-8.2, 4.8, -149], look: [0, 4.6, -175], fov: 46 },
  { t: 172, pos: [0, 3.5, -196], look: [0, 1.5, -245], fov: 50 },

  // CHAPTER III (175..225): Pull out into monumental living star network
  { t: 185, pos: [2.5, 2.8, -218], look: [0, 0, -255], fov: 52 },
  { t: 205, pos: [-8.5, 5.2, -220], look: [0, 0, -255], fov: 54 },
  { t: 222, pos: [0, 2.5, -278], look: [0, 0, -340], fov: 50 },

  // CHAPTER IV (225..285): Dark ignition -> organic convergence -> counter-rotating Yin-Yang -> grand pullback
  { t: 225, pos: [0, 0.4, -312], look: [0, 0, -340], fov: 46 },
  { t: 236, pos: [3.2, 1.4, -308], look: [0, 0, -340], fov: 47 },
  { t: 252, pos: [-1.8, 0.8, -301], look: [0, 0, -340], fov: 46 },
  { t: 266, pos: [0, 0.2, -295], look: [0, 0, -340], fov: 46 },
  { t: 279, pos: [0, 0.3, -280], look: [0, 0, -340], fov: 48 },
  { t: 285, pos: [0, 2.6, -368], look: [0, -1.0, -425], fov: 46 },

  // CHAPTER V (285..335): Quiet hours — slow descent to moonlit sanctuary planet & softly lit window
  { t: 295, pos: [3.2, 2.2, -396], look: [0, -1.2, -425], fov: 43 },
  { t: 312, pos: [1.4, 0.8, -407.5], look: [0, -1.4, -425], fov: 40 },
  { t: 326, pos: [-0.8, 0.6, -408.2], look: [0, -1.2, -425], fov: 41 },
  { t: 334, pos: [0, 2.4, -448], look: [0, 0, -515], fov: 48 },

  // FINAL CHAPTER (335..405): Convergence -> silence -> solitary star -> ISHA reveal -> slow intentional 32s push-in
  { t: 350, pos: [7.5, 3.8, -478], look: [0, 0, -515], fov: 50 },
  { t: 363, pos: [0, 1.5, -460], look: [0, 0, -515], fov: 55 },
  { t: 366, pos: [0, 0.1, -482], look: [0, 0, -515], fov: 44 },
  { t: 373, pos: [0, 0.0, -475], look: [0, 0, -515], fov: 47 },
  { t: 389, pos: [0, 0.18, -486], look: [0, 0, -515], fov: 45 },
  { t: 405, pos: [0, 0.28, -494], look: [0, 0, -515], fov: 43.2 },
];

const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 0, 0);
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
const _lA = new THREE.Vector3();
const _lB = new THREE.Vector3();

/**
 * Computes a brief, silk-smooth optical focus-rack pulse [0..0.38] right as the camera
 * glides across a chapter boundary, settling swiftly to 0.0 so every hero subject
 * remains razor-sharp throughout reading and observation beats.
 */
export function computeChapterRackFocus(filmTime: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  let peak = 0;
  for (let i = 1; i < CHAPTERS.length; i++) {
    const ch = CHAPTERS[i];
    if (!ch) continue;
    const d = Math.abs(filmTime - ch.start);
    if (d < 2.2) {
      const env = Math.exp(-(d * d) / 1.15);
      if (env > peak) peak = env;
    }
  }
  return clamp(peak * 0.36, 0, 0.36);
}

export class CameraDirector {
  private initialized = false;
  private pointerX = 0;
  private pointerY = 0;
  private smoothPtrX = 0;
  private smoothPtrY = 0;
  private driftClock = 0;

  public setPointerOffset(ndcX: number, ndcY: number): void {
    this.pointerX = clamp(ndcX, -1, 1);
    this.pointerY = clamp(ndcY, -1, 1);
  }

  public getSmoothedPointer(out: THREE.Vector2): THREE.Vector2 {
    return out.set(this.smoothPtrX, this.smoothPtrY);
  }

  public snapToTime(camera: THREE.PerspectiveCamera, timeSec: number): void {
    this.initialized = false;
    this.update(camera, timeSec, 0.016, false);
  }

  public snapToGalaxyFocus(
    camera: THREE.PerspectiveCamera,
    timeSec: number,
    center: THREE.Vector3,
    radius: number,
  ): void {
    this.initialized = false;
    this.update(camera, timeSec, 0.016, false, { active: true, center, radius });
  }

  public update(
    camera: THREE.PerspectiveCamera,
    timeSec: number,
    delta: number,
    reducedMotion: boolean,
    galaxyFocus?: { active: boolean; center: THREE.Vector3; radius: number },
  ): void {
    const t = clamp(timeSec, 0, FILM_DURATION);
    const safeDelta = clamp(delta, 0.001, 0.1);
    this.driftClock += safeDelta;

    const ptrAlpha = 1 - Math.exp(-3.5 * safeDelta);
    this.smoothPtrX += (this.pointerX - this.smoothPtrX) * ptrAlpha;
    this.smoothPtrY += (this.pointerY - this.smoothPtrY) * ptrAlpha;

    let targetFov: number;

    if (galaxyFocus?.active) {
      const radius = clamp(galaxyFocus.radius, 12, 60);
      // Frame the entire procedural galaxy cleanly in the upper-middle 3D viewport above the bottom dock
      const aspectBoost = camera.aspect < 1 ? 1.24 : 1.0;
      const dist = Math.max(46, radius * 2.65 * aspectBoost);
      const ptrScale = reducedMotion ? 0 : 2.8;
      _desiredPos.set(
        galaxyFocus.center.x + this.smoothPtrX * ptrScale,
        galaxyFocus.center.y + dist * 0.42 + this.smoothPtrY * ptrScale * 0.55,
        galaxyFocus.center.z + dist,
      );
      _desiredLook.set(
        galaxyFocus.center.x,
        galaxyFocus.center.y - radius * 0.16,
        galaxyFocus.center.z,
      );
      targetFov = camera.aspect < 1 ? 52 : 46;
    } else {
      // Find bracketing keyframes
      let idx = 0;
      for (let i = 0; i < KEYFRAMES.length - 1; i++) {
        const cur = KEYFRAMES[i];
        const nxt = KEYFRAMES[i + 1];
        if (cur && nxt && t >= cur.t && t <= nxt.t) {
          idx = i;
          break;
        }
      }
      const k0 = KEYFRAMES[idx] ?? KEYFRAMES[0]!;
      const k1 = KEYFRAMES[Math.min(idx + 1, KEYFRAMES.length - 1)] ?? k0;
      const segLen = Math.max(0.001, k1.t - k0.t);
      const localT = smoothstep(0, 1, (t - k0.t) / segLen);

      _pA.set(k0.pos[0], k0.pos[1], k0.pos[2]);
      _pB.set(k1.pos[0], k1.pos[1], k1.pos[2]);
      _desiredPos.lerpVectors(_pA, _pB, localT);

      _lA.set(k0.look[0], k0.look[1], k0.look[2]);
      _lB.set(k1.look[0], k1.look[1], k1.look[2]);
      _desiredLook.lerpVectors(_lA, _lB, localT);

      // Calm, serene cinematic pointer parallax + ultra-subtle handheld camera breathing
      const silenceDamp = 1 - smoothstep(SILENCE_START - 1.5, SILENCE_START + 0.5, t) * 0.88;
      const parallaxScale = (reducedMotion ? 0.14 : 0.30) * silenceDamp;

      _desiredPos.x += this.smoothPtrX * parallaxScale;
      _desiredPos.y += this.smoothPtrY * parallaxScale * 0.55;

      if (!reducedMotion) {
        // Filmic 70mm floating handheld micro-drift (gentle, organic, never jittery)
        const driftAmp = 0.055 * silenceDamp;
        const driftX =
          (Math.sin(this.driftClock * 0.37) * 0.6 + Math.cos(this.driftClock * 0.19) * 0.4) *
          driftAmp;
        const driftY =
          (Math.cos(this.driftClock * 0.31 + 1.1) * 0.65 +
            Math.sin(this.driftClock * 0.17) * 0.35) *
          driftAmp *
          0.75;
        _desiredPos.x += driftX;
        _desiredPos.y += driftY;
        _desiredLook.x += driftX * 0.35;
        _desiredLook.y += driftY * 0.35;
      }

      // Gently widen FOV on narrow portrait viewports (iPhone portrait) so horizontal subjects stay framed
      const portraitFovBoost = camera.aspect < 0.72 ? 9.5 : camera.aspect < 1.0 ? 5.0 : 0;
      targetFov = THREE.MathUtils.lerp(k0.fov, k1.fov, localT) + portraitFovBoost;
    }

    if (!this.initialized) {
      camera.position.copy(_desiredPos);
      _currentLook.copy(_desiredLook);
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
      camera.lookAt(_currentLook);
      this.initialized = true;
      return;
    }

    // Silky-smooth calm exponential damping for majestic, steady IMAX camera glide
    const dampSpeed = galaxyFocus?.active ? 4.2 : 2.1;
    const dampAlpha = 1 - Math.exp(-dampSpeed * safeDelta);
    camera.position.lerp(_desiredPos, dampAlpha);
    _currentLook.lerp(_desiredLook, dampAlpha);

    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dampAlpha);
      camera.updateProjectionMatrix();
    }

    camera.lookAt(_currentLook);
  }
}
