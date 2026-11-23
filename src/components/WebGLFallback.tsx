import { useEffect, useRef } from 'react';
import { ChapterDefinition, SILENCE_END, SILENCE_START, smoothstep } from '../data/chapters';

interface WebGLFallbackProps {
  filmTime: number;
  chapter: ChapterDefinition;
  reducedMotion: boolean;
}

/**
 * Lightweight 2D Canvas cosmic fallback for devices where WebGL is unavailable
 * or if a WebGL context loss occurs. Preserves the continuous visual tone,
 * Guiding Star, and full narrative journey without ever rendering a broken screen.
 */
export function WebGLFallback({ filmTime, chapter, reducedMotion }: WebGLFallbackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(filmTime);
  useEffect(() => {
    timeRef.current = filmTime;
  }, [filmTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = Array.from({ length: 180 }, (_, i) => ({
      x: (Math.sin(i * 78.233) * 0.5 + 0.5),
      y: (Math.cos(i * 45.164) * 0.5 + 0.5),
      r: 0.6 + (i % 4) * 0.45,
      phase: i * 0.43,
    }));

    let rafId = 0;
    const render = (now: number) => {
      const w = (canvas.width = window.innerWidth);
      const h = (canvas.height = window.innerHeight);
      const t = timeRef.current;
      const inSilence = t >= SILENCE_START && t < SILENCE_END;

      ctx.fillStyle = inSilence ? '#020308' : chapter.fogColor;
      ctx.fillRect(0, 0, w, h);

      // Soft central nebula glow
      const glowRadius = Math.min(w, h) * 0.48;
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.48, 4, w * 0.5, h * 0.48, glowRadius);
      grad.addColorStop(0, inSilence ? 'rgba(245, 224, 175, 0.22)' : 'rgba(228, 193, 122, 0.16)');
      grad.addColorStop(0.45, inSilence ? 'rgba(10, 12, 24, 0.05)' : 'rgba(66, 48, 124, 0.14)');
      grad.addColorStop(1, 'rgba(2, 3, 8, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Stars
      const starOp = inSilence ? 0.08 : 0.85;
      for (const s of stars) {
        const drift = reducedMotion ? 0 : (now * 0.000012 * s.r) % 1;
        const x = ((s.x + drift) % 1) * w;
        const y = s.y * h;
        const twinkle = 0.6 + 0.4 * Math.sin(now * 0.0014 + s.phase);
        ctx.fillStyle = `rgba(244, 236, 214, ${twinkle * starOp})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Central Guiding Star
      const burst = smoothstep(SILENCE_END, SILENCE_END + 4, t);
      const coreR = 5 + burst * 18;
      const starGrad = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, coreR * 4);
      starGrad.addColorStop(0, 'rgba(255, 249, 232, 0.95)');
      starGrad.addColorStop(0.35, 'rgba(232, 192, 112, 0.4)');
      starGrad.addColorStop(1, 'rgba(232, 192, 112, 0)');
      ctx.fillStyle = starGrad;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.48, coreR * 4, 0, Math.PI * 2);
      ctx.fill();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [chapter.fogColor, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="cosmic-fallback-canvas"
      className="fixed inset-0 w-full h-full block"
      aria-label="Cosmic visual backdrop"
    />
  );
}
