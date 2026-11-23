# Contributing to COSMOS

Thank you for your interest in contributing to **COSMOS — A Story Told by the Universe**!

## Development Workflow

1. Fork the repository and create a feature branch (`git checkout -b feat/your-improvement`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local dev server on port 3000:
   ```bash
   npm run dev
   ```
4. Before opening a pull request, make sure all checks pass:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```

## Engineering Guidelines

- **Strict TypeScript**: `strict`, `noUncheckedIndexedAccess`, and `noImplicitReturns` are enabled. Avoid `any` or broad type suppressions.
- **Zero Per-Frame GC**: Inside `requestAnimationFrame` loops, reuse pre-allocated `THREE.Vector3`, `THREE.Color`, and uniform containers.
- **Resource Disposal**: Every newly created Three.js geometry, material, texture, render target, Web Audio node, timer, or DOM listener must be registered for cleanup in `dispose()`.
- **Mobile & iOS Safari First**: Keep DPR capped sensibly, respect `env(safe-area-inset-*)`, avoid CSS `backdrop-filter` over the active WebGL canvas, and verify portrait and landscape layouts.
- **Spoiler Integrity**: Never reveal the hidden Final Chapter title or birthday message before `TITLE_REVEAL_TIME` (`371.5s`).

## Pull Requests

Please fill out the pull request template clearly and include unit tests for any pure-logic changes in `src/**/*.test.ts`.
