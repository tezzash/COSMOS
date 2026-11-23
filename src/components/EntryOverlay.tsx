import { useEffect, useState } from 'react';

interface EntryOverlayProps {
  onEnter: () => void;
}

export function EntryOverlay({ onEnter }: EntryOverlayProps) {
  const [loadProgress, setLoadProgress] = useState(18);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setLoadProgress(64), 120);
    const t2 = window.setTimeout(() => setLoadProgress(100), 260);
    const t3 = window.setTimeout(() => setReady(true), 340);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center px-6 text-center select-none"
      style={{
        background:
          'radial-gradient(circle at 50% 48%, rgba(16, 22, 46, 0.36) 0%, rgba(2, 3, 9, 0.86) 62%, rgba(2, 3, 8, 0.96) 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Enter the cosmic film experience"
    >
      <div className="max-w-xl flex flex-col items-center gap-7">
        <p className="text-xs tracking-[0.34em] uppercase text-[#cbb995]/80 font-normal">
          A Continuous Cosmic Short Film
        </p>

        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-light tracking-[0.06em] text-[#f4efe4] leading-[1.15] [text-wrap:balance] cinema-text-shadow">
          Before Anything Had a Name
        </h1>

        <p className="font-display italic text-lg sm:text-xl text-[#c7c2b8]/85 max-w-md leading-relaxed">
          Narrated by the Universe · Approximate runtime 6 minutes 45 seconds
        </p>

        <div className="w-44 h-[1px] bg-white/15 overflow-hidden relative my-1" aria-hidden="true">
          <div
            className="h-full bg-[#e4c17a] transition-all duration-300 ease-out"
            style={{ width: `${loadProgress}%` }}
          />
        </div>

        <div className="flex flex-col items-center gap-4 pt-1">
          <button
            type="button"
            onClick={onEnter}
            disabled={!ready}
            className="group relative px-9 py-3.5 text-sm tracking-[0.26em] uppercase font-medium text-[#f8ecd2] border border-[#e4c17a]/55 bg-[#090d1b]/90 hover:bg-[#e4c17a]/15 hover:border-[#f2d593] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e4c17a] transition-all duration-200 disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            Enter the Universe
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[#9c9990]">
            <span>Audio enables upon entry</span>
            <span aria-hidden="true">·</span>
            <span>Captions active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
