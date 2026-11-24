import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CHAPTERS,
  ChapterDefinition,
  FILM_DURATION,
  formatTimecode,
} from '../data/chapters';
import {
  type QualityMode,
  type QualitySnapshot,
  formatQualityModeLabel,
  formatQualityTierLabel,
} from '../engine/deviceProfile';

interface CinemaControlsProps {
  filmTime: number;
  chapter: ChapterDefinition;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  captionsEnabled: boolean;
  controlsCollapsed: boolean;
  qualityMode: QualityMode;
  qualitySnapshot: QualitySnapshot | null;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onReplay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (vol: number) => void;
  onToggleCaptions: () => void;
  onCycleQuality: () => void;
  onToggleCollapsed: () => void;
}

export function CinemaControls({
  filmTime,
  chapter,
  isPlaying,
  isMuted,
  volume,
  captionsEnabled,
  controlsCollapsed,
  qualityMode,
  qualitySnapshot,
  onTogglePlay,
  onSeek,
  onReplay,
  onToggleMute,
  onVolumeChange,
  onToggleCaptions,
  onCycleQuality,
  onToggleCollapsed,
}: CinemaControlsProps) {
  const modeLabel = formatQualityModeLabel(qualityMode);
  const resolvedTierLabel = qualitySnapshot
    ? formatQualityTierLabel(qualitySnapshot.activeTier)
    : null;
  const qualityButtonLabel =
    qualityMode === 'auto' && resolvedTierLabel ? `Auto · ${resolvedTierLabel}` : modeLabel;
  const qualityDescription = qualitySnapshot
    ? `Rendering quality: ${modeLabel} (${resolvedTierLabel}, ${qualitySnapshot.effectiveDpr.toFixed(2)}x resolution). Click to switch.`
    : `Rendering quality: ${modeLabel}. Click to switch.`;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(860px,94vw)] flex flex-col items-center">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!controlsCollapsed}
        aria-label={controlsCollapsed ? 'Show cinema controls' : 'Hide cinema controls'}
        className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 text-[11px] tracking-[0.14em] uppercase text-[#c7c2b6] bg-[#060914]/90 border border-white/12 hover:border-[#e4c17a]/50 hover:text-[#f5e7c7] focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer whitespace-nowrap"
      >
        {controlsCollapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Hide</span>
          </>
        )}
      </button>

      {!controlsCollapsed && (
        <nav
          aria-label="Film playback controls"
          className="w-full bg-[#050814]/92 border border-white/12 px-4 py-2.5 flex flex-col gap-2"
        >
          {/* Row 1: Timeline Scrubber + Timecode */}
          <div className="flex items-center gap-3">
            <span className="font-mono-tabular text-[11px] text-[#e4c17a] w-11 shrink-0">
              {formatTimecode(filmTime)}
            </span>

            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={FILM_DURATION}
                step={0.5}
                value={filmTime}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="Film timeline scrubber"
                className="cinema-scrubber w-full"
              />
            </div>

            <span className="font-mono-tabular text-[11px] text-[#9b9ea9] w-11 text-right shrink-0">
              {formatTimecode(FILM_DURATION)}
            </span>
          </div>

          {/* Row 2: Single-line Playback, Audio, Chapters & Captions */}
          <div className="flex items-center justify-between gap-2 flex-nowrap">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause film' : 'Play film'}
                className="inline-flex items-center justify-center w-8 h-8 text-[#f6e8c8] border border-white/12 bg-white/[0.03] hover:border-[#e4c17a]/55 hover:bg-[#e4c17a]/10 focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={onReplay}
                aria-label="Replay film from beginning"
                className="inline-flex items-center justify-center w-8 h-8 text-[#c9c5ba] border border-white/10 hover:text-[#f6e8c8] hover:border-[#e4c17a]/45 focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-1.5 pl-0.5">
                <button
                  type="button"
                  onClick={onToggleMute}
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                  aria-pressed={isMuted}
                  className="inline-flex items-center justify-center w-8 h-8 text-[#c9c5ba] border border-white/10 hover:text-[#f6e8c8] hover:border-[#e4c17a]/45 focus-visible:outline-2 focus-visible:outline-[#e4c17a] transition-colors cursor-pointer shrink-0"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  aria-label="Audio volume"
                  className="cinema-scrubber hidden sm:block w-16"
                />
              </div>
            </div>

            {/* Spoiler-free Chapter selector buttons */}
            <div className="hidden md:flex items-center gap-0.5 shrink-0" role="group" aria-label="Chapters">
              {CHAPTERS.map((ch) => {
                const active = ch.id === chapter.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSeek(ch.start + 0.5)}
                    aria-current={active ? 'step' : undefined}
                    className={`px-2 py-1 text-[11px] tracking-[0.05em] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#e4c17a] ${
                      active
                        ? 'text-[#f8e7bf] border-b border-[#e4c17a]'
                        : 'text-[#8e92a3] hover:text-[#dbd6c9]'
                    }`}
                  >
                    {ch.index === 0 ? '0' : ch.index === 6 ? 'Final' : `Ch ${ch.index}`}
                  </button>
                );
              })}
            </div>

            {/* Rendering Quality & Captions toggles */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onCycleQuality}
                title={qualityDescription}
                aria-label={qualityDescription}
                data-testid="quality-toggle"
                data-quality-mode={qualityMode}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-xs border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#e4c17a] ${
                  qualityMode !== 'auto'
                    ? 'text-[#f6e8c8] border-[#e4c17a]/45 bg-[#e4c17a]/10'
                    : 'text-[#c9c5ba] border-white/12 hover:text-[#f6e8c8] hover:border-[#e4c17a]/45'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{qualityButtonLabel}</span>
                <span className="sm:hidden">{modeLabel}</span>
              </button>

              <button
                type="button"
                onClick={onToggleCaptions}
                aria-pressed={captionsEnabled}
                aria-label={captionsEnabled ? 'Disable captions' : 'Enable captions'}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-xs border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#e4c17a] ${
                  captionsEnabled
                    ? 'text-[#f6e8c8] border-[#e4c17a]/45 bg-[#e4c17a]/10'
                    : 'text-[#9d9fa9] border-white/10 hover:text-[#e8e3d6]'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Captions</span>
              </button>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
