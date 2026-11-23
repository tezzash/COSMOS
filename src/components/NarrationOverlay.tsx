import { RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { CaptionSyncSnapshot } from '../audio/audioClockSync';
import {
  BIRTHDAY_REVEAL_TIME,
  ChapterDefinition,
  ORBITAL_CODA_TIME,
  POSTSCRIPT_REVEAL_TIME,
  TITLE_REVEAL_TIME,
  getRevealStage,
} from '../data/chapters';
import {
  AstronomicalFact,
  ConstellationTrait,
  FINAL_POSTSCRIPT,
  NarrationLine,
} from '../data/screenplay';

interface NarrationOverlayProps {
  filmTime: number;
  chapter: ChapterDefinition;
  activeLine: NarrationLine | null;
  captionSync?: CaptionSyncSnapshot | null;
  activeFacts: AstronomicalFact[];
  activeTrait: ConstellationTrait | null;
  captionsEnabled: boolean;
  controlsCollapsed: boolean;
  birthStarLaunched: boolean;
  networkConnections: number;
  isComplete: boolean;
  onTriggerBirthStar: () => void;
  onTriggerNetworkPulse: () => void;
  onReplay: () => void;
}

const CINEMA_EASE = [0.22, 1, 0.36, 1] as const;

export function NarrationOverlay({
  filmTime,
  chapter,
  activeLine,
  captionSync,
  activeFacts,
  activeTrait,
  captionsEnabled,
  controlsCollapsed,
  birthStarLaunched,
  networkConnections,
  isComplete,
  onTriggerBirthStar,
  onTriggerNetworkPulse,
  onReplay,
}: NarrationOverlayProps) {
  // Prefer high-precision Web Audio currentTime-triggered caption when audio clock is active
  const syncedLine =
    captionSync && captionSync.clockSource === 'web-audio'
      ? captionSync.line
      : activeLine;

  const revealStage = getRevealStage(filmTime);
  const showChapterTitle =
    filmTime - chapter.start < 6.5 && filmTime > 1.0 && revealStage !== 'silence';

  const showBirthStarPrompt =
    chapter.id === 'chapter-1' &&
    filmTime >= 82 &&
    filmTime <= 104 &&
    !birthStarLaunched;

  const showNetworkPrompt =
    chapter.id === 'chapter-3' && filmTime >= 180 && filmTime <= 223;

  const showTitle = filmTime >= TITLE_REVEAL_TIME;
  const showBirthday = filmTime >= BIRTHDAY_REVEAL_TIME;
  const showOrbitalCoda = filmTime >= ORBITAL_CODA_TIME;
  const showPostscript = filmTime >= POSTSCRIPT_REVEAL_TIME;

  return (
    <motion.div
      key="narration-overlay-global"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: CINEMA_EASE }}
      data-narration-motion="framer-motion"
      data-narration-tone={syncedLine?.tone ?? 'none'}
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between"
    >
      {/* Top Zone: Subtle chapter anchor (left) + Ephemeris facts in Chapter I (right) */}
      <div className="flex items-start justify-between gap-6 px-6 sm:px-10 pt-6 sm:pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={chapter.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: showChapterTitle ? 0.92 : 0.42, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.85, ease: CINEMA_EASE }}
          >
            <p className="text-[11px] tracking-[0.28em] uppercase text-[#d8b878] font-medium">
              {chapter.roman}
            </p>
            <p className="font-display text-lg sm:text-xl text-[#efe9dc] tracking-[0.04em] mt-0.5 cinema-text-shadow">
              {chapter.title}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Chapter I subtle astronomical overlays — unboxed cinematic typography, never cards */}
        <aside
          aria-label="Astronomical observations for 25 November 2002"
          className="hidden sm:flex flex-col items-end gap-3 text-right max-w-xs"
        >
          <AnimatePresence>
            {activeFacts.map((fact) => (
              <motion.div
                key={fact.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.7, ease: CINEMA_EASE }}
                className="border-r border-[#e4c17a]/45 pr-3.5"
              >
                <p className="text-[10px] tracking-[0.22em] uppercase text-[#cbb689]">
                  {fact.label}
                </p>
                <p className="font-mono-tabular text-sm text-[#f7f2e7] tracking-wide mt-0.5 cinema-text-shadow">
                  {fact.value}
                </p>
                <p className="text-[11px] text-[#b4b7c4] mt-0.5">{fact.detail}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </aside>
      </div>

      {/* Center Zone: Chapter II Constellation Traits OR Final Chapter ISHA Constellation Reveal */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait">
          {activeTrait && chapter.id === 'chapter-2' && (
            <motion.div
              key={activeTrait.word}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.65, ease: CINEMA_EASE }}
              className="flex flex-col items-center gap-2"
            >
              <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#e4c17a]/70 to-transparent" />
              <p className="font-display text-2xl sm:text-3xl tracking-[0.42em] text-[#f5dfb1]/90 uppercase cinema-text-shadow">
                {activeTrait.word}
              </p>
              <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#e4c17a]/70 to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* FINAL CHAPTER MONUMENTAL TITLE REVEAL — First & only appearance of ISHA */}
        <AnimatePresence>
          {showTitle && (
            <motion.div
              key="isha-title-reveal"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 1.35, ease: CINEMA_EASE }}
              className="flex flex-col items-center max-w-2xl px-4"
              data-testid="title-reveal"
            >
              {/* Delicate geometric constellation thread above the title */}
              <svg
                width="240"
                height="34"
                viewBox="0 0 240 34"
                fill="none"
                aria-hidden="true"
                className="mb-3 opacity-85"
              >
                <path
                  d="M16 24 L68 12 L120 6 L172 12 L224 24"
                  stroke="#e4c17a"
                  strokeOpacity="0.48"
                  strokeWidth="0.9"
                />
                <circle cx="16" cy="24" r="1.8" fill="#f7e3b5" />
                <circle cx="68" cy="12" r="2.2" fill="#f7e3b5" />
                <circle cx="120" cy="6" r="3" fill="#fff7e2" />
                <circle cx="172" cy="12" r="2.2" fill="#f7e3b5" />
                <circle cx="224" cy="24" r="1.8" fill="#f7e3b5" />
              </svg>

              <h1 className="font-display text-6xl sm:text-8xl md:text-[6.75rem] font-light tracking-[0.44em] pl-[0.44em] text-[#fff6e0] leading-none constellation-title-glow select-text">
                ISHA
              </h1>

              <motion.div
                initial={false}
                animate={{
                  opacity: showBirthday ? 1 : 0,
                  y: showBirthday ? 0 : 10,
                }}
                transition={{ duration: 1.0, ease: CINEMA_EASE }}
                className="mt-6 flex flex-col items-center gap-2"
                data-testid="birthday-reveal"
              >
                <p className="font-mono-tabular text-xs sm:text-sm tracking-[0.36em] uppercase text-[#e4c17a]">
                  25 NOVEMBER
                </p>
                <p className="font-display text-2xl sm:text-3xl font-normal tracking-[0.08em] text-[#f5efe2] mt-1 cinema-text-shadow">
                  Happy Birthday, Isha.
                </p>
              </motion.div>

              <motion.div
                initial={false}
                animate={{
                  opacity: showOrbitalCoda ? 1 : 0,
                  y: showOrbitalCoda ? 0 : 8,
                }}
                transition={{ duration: 1.05, ease: CINEMA_EASE }}
                className="mt-5 flex items-center justify-center gap-3 text-[11px] sm:text-xs font-mono-tabular tracking-[0.22em] uppercase text-[#cbb993]/90 cinema-text-shadow"
                data-testid="orbital-coda"
              >
                <span>24 Orbits</span>
                <span aria-hidden="true" className="text-[#e4c17a]/55">·</span>
                <span>22.5 Billion km</span>
                <span aria-hidden="true" className="text-[#e4c17a]/55">·</span>
                <span>2002 — 2026</span>
              </motion.div>

              <motion.div
                initial={false}
                animate={{
                  opacity: showPostscript ? 1 : 0,
                  y: showPostscript ? 0 : 8,
                }}
                transition={{ duration: 1.05, ease: CINEMA_EASE }}
                className="mt-6 max-w-lg"
              >
                <p className="font-display italic text-base sm:text-lg text-[#d7cfbe]/90 leading-relaxed cinema-text-shadow">
                  {FINAL_POSTSCRIPT}
                </p>

                {(isComplete || filmTime >= 397) && (
                  <div className="mt-6 pointer-events-auto">
                    <button
                      type="button"
                      onClick={onReplay}
                      className="inline-flex items-center gap-2.5 px-6 py-2.5 text-xs tracking-[0.24em] uppercase text-[#f6e6c2] border border-[#e4c17a]/55 bg-[#060915]/90 hover:bg-[#e4c17a]/15 hover:border-[#f2d593] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Replay Journey</span>
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lower Zone: Subtle interactive affordances + Poetic Universe narration captions */}
      <div
        className={`w-full flex flex-col items-center px-5 sm:px-10 pt-8 transition-all duration-300 ${
          controlsCollapsed ? 'pb-16' : 'pb-36 sm:pb-34'
        }`}
        style={{
          background:
            'linear-gradient(to top, rgba(2, 3, 9, 0.84) 0%, rgba(2, 3, 9, 0.42) 58%, rgba(2, 3, 9, 0) 100%)',
        }}
      >
        {/* Optional non-blocking interactive prompt for Chapter I Birth Star */}
        <AnimatePresence>
          {showBirthStarPrompt && (
            <motion.div
              key="birth-star-prompt"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.55, ease: CINEMA_EASE }}
              className="mb-4 pointer-events-auto flex items-center gap-3 text-xs text-[#e8cf97]"
            >
              <span>Tap the luminous particle above Earth, or</span>
              <button
                type="button"
                onClick={onTriggerBirthStar}
                className="px-3.5 py-1.5 border border-[#e4c17a]/55 bg-[#070b18]/90 text-[#fbf0d6] tracking-[0.16em] uppercase text-[11px] hover:bg-[#e4c17a]/20 focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer whitespace-nowrap"
              >
                Release Star
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Optional interactive prompt for Chapter III Living Star Network */}
        <AnimatePresence>
          {showNetworkPrompt && (
            <motion.div
              key="network-prompt"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.55, ease: CINEMA_EASE }}
              className="mb-4 pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-[#d6ccb4]"
            >
              <span>Move across the star field to connect distant worlds</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#e4c17a]" data-testid="network-count">
                {networkConnections} connections
              </span>
              <button
                type="button"
                onClick={onTriggerNetworkPulse}
                className="px-3 py-1 border border-[#e4c17a]/50 bg-[#070b18]/90 text-[#fbf0d6] tracking-[0.14em] uppercase text-[11px] hover:bg-[#e4c17a]/20 focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer whitespace-nowrap"
              >
                Send Ripple
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* High-Precision Web Audio currentTime-Synchronized Universe Narration Captions */}
        <div
          className="min-h-[3.75rem] max-w-3xl flex items-center justify-center text-center"
          aria-live="polite"
          aria-atomic="true"
        >
          <AnimatePresence mode="wait">
            {captionsEnabled && syncedLine && (() => {
              const highlightSpeech =
                Boolean(captionSync?.isSpeaking) &&
                captionSync?.line?.id === syncedLine.id &&
                (captionSync?.spokenCharIndex ?? 0) > 0;
              const splitIdx = highlightSpeech
                ? Math.min(syncedLine.text.length, captionSync?.spokenCharIndex ?? 0)
                : 0;

              return (
                <motion.p
                  key={syncedLine.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.65, ease: CINEMA_EASE }}
                  data-testid="narration-caption"
                  data-clock-source={captionSync?.clockSource ?? 'fallback'}
                  data-audio-time={
                    captionSync ? captionSync.audioTime.toFixed(4) : '0.0000'
                  }
                  className={`font-display text-lg sm:text-2xl md:text-[1.6rem] leading-[1.42] tracking-[0.015em] cinema-text-shadow [text-wrap:balance] ${
                    syncedLine.tone === 'playful'
                      ? 'text-[#f6e8c8]'
                      : syncedLine.tone === 'quiet'
                        ? 'text-[#d8dfec]'
                        : 'text-[#f4f1ea]'
                  }`}
                >
                  {highlightSpeech ? (
                    <>
                      “<span className="text-[#fffaf0]">{syncedLine.text.slice(0, splitIdx)}</span>
                      <span className="opacity-68">{syncedLine.text.slice(splitIdx)}</span>”
                    </>
                  ) : (
                    <>“{syncedLine.text}”</>
                  )}
                </motion.p>
              );
            })()}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
