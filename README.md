# COSMOS — A Story Told by the Universe

> An interactive WebGL cinematic journey through the Universe.

**COSMOS** is a continuous 6-minute-45-second (`405s`) interactive 3D cinematic short film built with **React 19**, **TypeScript**, **Three.js**, custom **GLSL shaders**, and **spatial Web Audio**. Travelling seamlessly along a single unbroken cosmic corridor across seven chapters—from a raymarched Schwarzschild/Kerr singularity and NASA 4K Earth dawn over Hyderabad to a sequential Sagittarius constellation, a living interactive star network, a pure-cosmic-entity Yin-Yang formation, a moonlit twilight sanctuary, and a sacred silence before the final revelation—it is engineered for razor-sharp desktop cinema and thermally sustainable 60 FPS playback on **iPhone 17 Pro Max (iOS Safari)**.

---

## Features

- **Seven Unbroken Continuous Chapters (`00:00–06:45`)**
  - **Prologue (`00:00–00:55`)**: Geodesic raymarched singularity with Doppler-beamed accretion disk, curl-noise Big Bang filaments, and a deep sub-harmonic cosmic ignition rumble.
  - **Chapter I (`00:55–01:50`)**: 4K NASA Blue Marble & Black Marble Earth with 6-slice volumetric cumulus clouds, Rayleigh/Mie dawn scattering over Hyderabad (25 November 2002), analytical Earth umbra/penumbra eclipse shadows on the Waning Gibbous Moon and astrolabe rings, and an interactive Birth Star.
  - **Chapter II (`01:50–02:55`)**: Real star-by-star sequential Sagittarius constellation connected by animated luminous beams and leading sparks, framed by 4 composite 3D artifacts.
  - **Chapter III (`02:55–03:45`)**: Interactive 3D star network with curved quadratic Bézier energy filaments and touch/pointer shockwave ripples.
  - **Chapter IV (`03:45–04:45`)**: Pure-cosmic-entity **Yin-Yang formation** constructed strictly from tens of thousands of pinpoint stars, dense star clusters, volumetric self-lit FBM nebulae, two counter-rotating miniature spiral seed galaxies, and a delicate perimeter star stream—zero solid outlines or vector overlays.
  - **Chapter V (`04:45–05:35`)**: *Even Stars Have Quiet Hours* — a custom GLSL high-resolution twilight sanctuary planet with multi-octave mountain/ocean relief, atmospheric rim glow, softly illuminated observatory terrace window, and gentle dawn bloom.
  - **Final Chapter (`05:35–06:45`)**: Converging geodesic portal, rising tension swell, **sacred silence (`06:05–06:10.5`)**, resonant title impact, golden supernova burst, slow intimate camera push-in, and spoiler-free final revelation.
- **Interactive Procedural Galaxy Generator**: Live-editable spiral, barred-spiral, and triaxial elliptical galaxies with custom GLSL disk, starfield, and volumetric nebula layers, plus cohesive cosmic color palettes.
- **Real Astronomical Sky**: ~9,000 Hipparcos/Gaia catalog stars positioned for the Hyderabad sky on 25 November 2002, paired with a 4K Milky Way vault.
- **iPhone 17 Pro Max & iOS Safari Performance Engineering**:
  - Multi-signal mobile/iOS detection (pointer coarseness, touch points, screen geometry, hardware telemetry—not just `window.innerWidth`).
  - Dynamic **HIGH / BALANCED / THERMAL-SAFE** quality tiers with frame-time EMA monitoring, intelligent 60 FPS thermal pacing on 120Hz ProMotion displays, and adaptive DPR & particle draw-range scaling.
  - Full WebGL context loss/restoration, Safari tab backgrounding (`visibilitychange`/`pagehide`) pause-and-resume, safe-area insets for Dynamic Island & home indicator, and comfortable `>= 44px` touch targets.
- **Cinematic Spatial Audio**: Pure-sine chamber pads, felt-piano & glass-harp HRTF binaural spatialization, concert-hall convolution reverb, Big Bang tectonic rumble, pre-silence riser, title impact, and optional personal reveal audio track support (`VITE_REVEAL_AUDIO_URL`).

---

## Visual Overview & Demo

Launch locally and open `http://localhost:3000` (or append `?autostart=1&t=273` to jump directly into Chapter IV, `?autostart=1&t=305` for Chapter V, or `?autostart=1&t=372` for the Final Chapter):

| Chapter / View | Preview Query | Highlights |
| --- | --- | --- |
| Entry Experience | `/` | Spoiler-free title card with live initialization progress & audio gesture unlock |
| Prologue Singularity | `/?autostart=1&t=12` | Raymarched black hole photon ring, Milky Way lensing & Big Bang filaments |
| Chapter I — Earth | `/?autostart=1&t=84` | 4K Earth terminator over Hyderabad, volumetric clouds & eclipse Moon |
| Chapter IV — Cosmic Yin-Yang | `/?autostart=1&t=273` | 27k+ stars, FBM nebulae & 6 perimeter pullback galaxies |
| Chapter V — Quiet Hours | `/?autostart=1&t=310` | Procedural GLSL moonlit twilight world, warm arched window & dawn bloom |
| Procedural Galaxy Generator | Click **Galaxies** in dock | Live Spiral / Barred / Elliptical generator with custom color & density controls |

---

## Prerequisites & Installation

- **Node.js** `>= 20` (tested on Node 22) or **Bun** `>= 1.1`
- A WebGL2-capable browser (or fallback to built-in 2D Canvas mode automatically when WebGL is unavailable)

```bash
# Clone the repository
git clone <your-repo-url> cosmos
cd cosmos

# Install with npm
npm install

# Or install with Bun
bun install
```

---

## Commands (npm & Bun)

| Task | npm | Bun |
| --- | --- | --- |
| Start dev server (`:3000`) | `npm run dev` | `bun run dev` |
| Production build | `npm run build` | `bun run build` |
| Preview production build | `npm run preview` | `bun run preview` |
| Strict TypeScript check | `npm run typecheck` | `bun run typecheck` |
| Run unit test suite (Vitest) | `npm run test` | `bun run test` |
| Lint codebase (ESLint) | `npm run lint` | `bun run lint` |

---

## Environment Configuration

All environment variables are optional and validated safely at runtime via `src/utils/env.ts`. Missing or malformed values automatically fall back to safe defaults without crashing.

Copy `.env.example` to `.env` if you wish to customize:

```bash
cp .env.example .env
```

- `VITE_REVEAL_AUDIO_URL`: Optional URL or Vite-served path to a personal song (`.mp3`, `.m4a`, `.ogg`, `.wav`) that crossfades in gracefully at the Final Chapter reveal (`371.5s`). Leave blank to play the built-in procedural felt-piano & orchestral reveal cascade.
- `VITE_QUALITY_TIER`: Optional initial quality override (`auto` | `high` | `balanced` | `thermal-safe`). Defaults to `auto`.
- `APP_URL`: Optional canonical URL for deployment metadata.

---

## Architecture Overview

```text
src/
├── App.tsx                       # Root lifecycle, iOS visibility/audio/WebGL guards, state sync
├── index.css                     # Tailwind CSS v4, dynamic viewport (100dvh), iOS safe areas
├── assets/textures/              # Bundled 4K Earth, Moon & Milky Way textures (ES imports)
├── utils/
│   └── env.ts                    # Validated runtime environment configuration with safe defaults
├── data/
│   ├── chapters.ts               # 7-chapter 405s timeline, reveal state machine, math helpers
│   └── screenplay.ts             # Paced narration lines (~135–150 WPM), ephemeris & traits
├── audio/
│   ├── AudioController.ts        # iOS-safe Web Audio engine, HRTF panner, reverb, SFX, reveal song
│   ├── ambientAtmosphere.ts      # Time-synced dynamic filter swell envelopes
│   ├── audioClockSync.ts         # Web Audio currentTime-locked caption synchronizer
│   ├── hapticsService.ts         # Mobile vibration pulse service
│   └── voiceSync.ts              # Speech pacing helpers
├── components/
│   ├── EntryOverlay.tsx          # Spoiler-free entry screen with live load readiness & retry
│   ├── NarrationOverlay.tsx      # Safe-area typography, ephemeris, traits & final reveal
│   ├── CinemaControls.tsx        # Collapsible touch-friendly bottom dock & chapter jumper
│   ├── GalaxyStudioDrawer.tsx    # Interactive Procedural Galaxy Generator UI
│   └── WebGLFallback.tsx         # 2D Canvas cosmic fallback & recovery retry button
└── engine/
    ├── CosmicEngine.ts           # Three.js renderer, adaptive quality tiers, composer & lifecycle
    ├── CameraDirector.ts         # Continuous keyframes, handheld drift & final slow push-in
    ├── deviceProfile.ts          # Multi-signal mobile/iPhone 17 Pro Max detection & quality manager
    ├── shaders.ts                # Custom GLSL shaders (Earth, clouds, geodesic singularity, stars)
    ├── gpgpuParticles.ts         # HalfFloat ping-pong GPGPU particle advection
    ├── cinemaPass.ts             # Optical rack focus, anamorphic flare, lens dust & shadow grain
    ├── lutPass.ts / colorGrading.ts  # 32x32x32 chapter-blended Kodak 2383 3D LUT color science
    ├── proceduralGalaxy.ts       # Deterministic spiral / barred / elliptical generator
    ├── cosmicYinYang.ts          # Pure-cosmic-entity Yin-Yang star & nebula generator
    └── scenes/                   # Modular chapter scenes (Earth, Sagittarius, Network, Yin-Yang, Quiet Hours, Reveal)
```

---

## Deployment

COSMOS compiles to a static production bundle in `dist/` with hashed Vite asset imports (safe for root or subpath hosting):

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Deploy the `dist/` directory to any static host (**Cloudflare Pages**, **Vercel**, **Netlify**, **GitHub Pages**, or **Cloud Run + Nginx**). Serve over **HTTPS** so iOS Safari unlocks Web Audio, `visualViewport`, and Home Screen Web App installation cleanly.

---

## Accessibility & Browser Requirements

- **Reduced Motion**: Automatically honors `prefers-reduced-motion: reduce` (attenuates handheld camera drift, parallax sway, and high-frequency motion while keeping the complete narrative and visuals intact).
- **Keyboard Navigation**:
  - `Enter` / `Space`: Enter experience or Play/Pause
  - `←` / `→`: Seek `-5s` / `+5s`
  - `M`: Mute/Unmute · `C`: Toggle Captions · `H`: Hide/Show Controls · `R`: Replay
- **Screen Readers & Non-Pointer Users**: Full ARIA labels, `aria-live="polite"` captions, and accessible buttons for every 3D interaction (*Release Star* in Chapter I, *Send Ripple* in Chapter III).
- **WebGL & Audio Resilience**: Automatic 2D Canvas fallback with recovery retry on WebGL unavailability or GPU context loss; non-blocking visual playback if browser audio permissions are restricted.
- **Supported Browsers**:
  - iOS Safari 17+ / 18+ / 26+ (primary mobile target: **iPhone 17 Pro Max**, 6.9″ 2868×1320 ProMotion, portrait & landscape, Safari & Add-to-Home-Screen)
  - Desktop Chrome 120+, Safari 17+, Firefox 120+, Edge 120+

## License

Released under the [MIT License](./LICENSE).
