import { AnimatePresence, MotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioController } from './audio/AudioController';
import { computeAmbientAtmosphereState } from './audio/ambientAtmosphere';
import type { CaptionSyncSnapshot } from './audio/audioClockSync';
import { type HapticEventType, HapticsService } from './audio/hapticsService';
import { CinemaControls } from './components/CinemaControls';
import { EntryOverlay } from './components/EntryOverlay';
import { NarrationOverlay } from './components/NarrationOverlay';
import { WebGLFallback } from './components/WebGLFallback';
import {
  FILM_DURATION,
  clamp,
  getChapterAtTime,
  isTitleRevealed,
} from './data/chapters';
import {
  getActiveFacts,
  getActiveNarrationLine,
  getActiveTrait,
} from './data/screenplay';
import { CosmicEngine, isWebGLAvailable } from './engine/CosmicEngine';

function getInitialQueryParams(): { autostart: boolean; startTime: number } {
  if (typeof window === 'undefined') return { autostart: false, startTime: 0 };
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const rawT = Number(params.get('t'));
  const startTime = Number.isFinite(rawT) && rawT > 0 ? clamp(rawT, 0, FILM_DURATION) : 0;
  return { autostart, startTime };
}

export default function App() {
  const initialQuery = useMemo(() => getInitialQueryParams(), []);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CosmicEngine | null>(null);
  const audioRef = useRef<AudioController | null>(null);
  const [haptics] = useState<HapticsService>(() => new HapticsService());
  const [hapticsStats, setHapticsStats] = useState<{
    supported: boolean;
    pulses: number;
    last: HapticEventType | null;
  }>(() => ({
    supported: haptics.isSupported(),
    pulses: 0,
    last: null,
  }));

  const triggerHaptic = useCallback(
    (event: HapticEventType, intensity?: number, bypassCooldown?: boolean) => {
      haptics.trigger(event, intensity, bypassCooldown);
      setHapticsStats({
        supported: haptics.isSupported(),
        pulses: haptics.getPulseCount(),
        last: haptics.getLastEvent(),
      });
    },
    [haptics],
  );

  const [webglSupported, setWebglSupported] = useState<boolean>(() => isWebGLAvailable());
  const [hasEntered, setHasEntered] = useState<boolean>(initialQuery.autostart);
  const [isPlaying, setIsPlaying] = useState<boolean>(initialQuery.autostart);
  const [filmTime, setFilmTime] = useState<number>(initialQuery.startTime);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  const [networkConnections, setNetworkConnections] = useState<number>(0);
  const [birthStarLaunched, setBirthStarLaunched] = useState<boolean>(false);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.72);
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);
  const [captionSync, setCaptionSync] = useState<CaptionSyncSnapshot | null>(null);
  const captionUnsubRef = useRef<(() => void) | null>(null);

  // Refs for stable WebGL callback access without tearing down the canvas
  const audioControllerInit = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new AudioController();
      audioRef.current.setHighImpactAudioListener((eventType, intensity) => {
        triggerHaptic(eventType, intensity, eventType === 'reveal-supernova');
      });
      captionUnsubRef.current = audioRef.current.subscribeCaptionSync((snap) => {
        setCaptionSync(snap);
      });
    }
    return audioRef.current;
  }, [triggerHaptic]);

  const handleEngineTimeUpdate = useCallback(
    (t: number, connections: number, starLaunched: boolean) => {
      setFilmTime(t);
      setNetworkConnections(connections);
      setBirthStarLaunched(starLaunched);
      audioRef.current?.update(t);
    },
    [],
  );

  const callbacksRef = useRef({
    onTimeUpdate: handleEngineTimeUpdate,
    onFilmComplete: () => {
      setIsPlaying(false);
      setIsComplete(true);
      audioRef.current?.setPlaying(false);
    },
    onBirthStarTriggered: () => {
      setBirthStarLaunched(true);
      audioRef.current?.playInteractionChime(1.12, [1.5, 1.0, -4.0]);
      triggerHaptic('birth-star-ignition', 1.05, true);
    },
    onNetworkImpulse: (count: number, spatialPos?: readonly [number, number, number]) => {
      setNetworkConnections(count);
      audioRef.current?.playInteractionChime(0.95 + (count % 5) * 0.08, spatialPos);
      triggerHaptic('network-impulse', 0.9);
    },
    onNucleosynthesisBurst: (intensity: number) => {
      triggerHaptic('nucleosynthesis-burst', intensity);
    },
    onChapterTransition: () => {
      triggerHaptic('chapter-transition', 0.9);
    },
    onSpatialAnchor: (rx: number, ry: number, rz: number) => {
      audioRef.current?.setSpatialAnchor(rx, ry, rz);
    },
    getAudioBass: () => audioRef.current?.getBassEnergy() ?? 0,
    onContextLost: () => {
      setWebglSupported(false);
    },
  });

  useEffect(() => {
    callbacksRef.current.onTimeUpdate = handleEngineTimeUpdate;
  }, [handleEngineTimeUpdate]);

  // Mount Three.js WebGL engine ONCE in isolated ref container with safe fallback on init errors
  useEffect(() => {
    if (!webglSupported || !canvasContainerRef.current) return;

    let engine: CosmicEngine | null = null;
    try {
      engine = new CosmicEngine(
        canvasContainerRef.current,
        {
          onTimeUpdate: (t, c, b) => callbacksRef.current.onTimeUpdate(t, c, b),
          onFilmComplete: () => callbacksRef.current.onFilmComplete(),
          onBirthStarTriggered: () => callbacksRef.current.onBirthStarTriggered(),
          onNetworkImpulse: (c, sp) => callbacksRef.current.onNetworkImpulse(c, sp),
          onNucleosynthesisBurst: (intensity) => callbacksRef.current.onNucleosynthesisBurst(intensity),
          onChapterTransition: () => callbacksRef.current.onChapterTransition(),
          onSpatialAnchor: (x, y, z) => callbacksRef.current.onSpatialAnchor(x, y, z),
          getAudioBass: () => callbacksRef.current.getAudioBass(),
          onContextLost: () => callbacksRef.current.onContextLost(),
        },
        {
          entered: initialQuery.autostart,
          timeSec: initialQuery.startTime,
        },
      );
      engineRef.current = engine;
    } catch {
      queueMicrotask(() => setWebglSupported(false));
      return;
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, [webglSupported, initialQuery.autostart, initialQuery.startTime]);

  // Fallback timer loop when WebGL is unavailable so the film still plays completely
  useEffect(() => {
    if (webglSupported || !hasEntered || !isPlaying) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setFilmTime((prev) => {
        const next = Math.min(FILM_DURATION, prev + dt);
        audioRef.current?.update(next);
        if (next >= FILM_DURATION) {
          setIsPlaying(false);
          setIsComplete(true);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [webglSupported, hasEntered, isPlaying]);

  // Cleanup Web Audio, haptics & high-precision caption sync listener on unmount
  useEffect(() => {
    return () => {
      captionUnsubRef.current?.();
      captionUnsubRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      haptics.cancel();
    };
  }, [haptics]);

  // Keep mobile haptics synced to mute & playback state
  useEffect(() => {
    haptics.setMuted(isMuted);
    haptics.setEnabled(hasEntered && isPlaying);
  }, [haptics, hasEntered, isMuted, isPlaying]);

  const activeChapter = useMemo(() => getChapterAtTime(filmTime), [filmTime]);
  const activeLine = useMemo(() => getActiveNarrationLine(filmTime), [filmTime]);
  const activeFacts = useMemo(() => getActiveFacts(filmTime), [filmTime]);
  const activeTrait = useMemo(() => getActiveTrait(filmTime), [filmTime]);
  const atmosphereState = useMemo(
    () => computeAmbientAtmosphereState(filmTime, hasEntered && isPlaying, isMuted),
    [filmTime, hasEntered, isPlaying, isMuted],
  );

  // Keep browser document.title strictly spoiler-free until Final Chapter reveal
  useEffect(() => {
    if (isTitleRevealed(filmTime)) {
      document.title = 'ISHA — A Story Told by the Universe';
    } else {
      document.title = 'A Story Told by the Universe';
    }
  }, [filmTime]);

  const handleEnter = useCallback(() => {
    setHasEntered(true);
    setIsPlaying(true);
    setIsComplete(false);
    const audio = audioControllerInit();
    audio.setMuted(isMuted);
    audio.setVolume(volume);
    audio.setVoiceNarration(false);
    audio.initAndStart();
    audio.syncClock(initialQuery.startTime, true);
    engineRef.current?.enterUniverse(initialQuery.startTime);
  }, [audioControllerInit, initialQuery.startTime, isMuted, volume]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next && filmTime >= FILM_DURATION - 0.2) {
        engineRef.current?.replay();
        setFilmTime(0);
        setIsComplete(false);
        audioRef.current?.syncClock(0, true);
      } else {
        engineRef.current?.setPlaying(next);
      }
      audioRef.current?.setPlaying(next);
      return next;
    });
  }, [filmTime]);

  const handleSeek = useCallback((timeSec: number) => {
    const clamped = clamp(timeSec, 0, FILM_DURATION);
    setFilmTime(clamped);
    setIsComplete(clamped >= FILM_DURATION);
    engineRef.current?.seekTo(clamped);
    audioRef.current?.syncClock(clamped, isPlaying);
    audioRef.current?.update(clamped);
  }, [isPlaying]);

  const handleReplay = useCallback(() => {
    setIsComplete(false);
    setHasEntered(true);
    setIsPlaying(true);
    setFilmTime(0);
    setBirthStarLaunched(false);
    engineRef.current?.replay();
    const audio = audioControllerInit();
    audio.initAndStart();
    audio.syncClock(0, true);
    audio.setPlaying(true);
  }, [audioControllerInit]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    if (vol > 0 && isMuted) {
      setIsMuted(false);
      audioRef.current?.setMuted(false);
    }
    audioRef.current?.setVolume(vol);
  }, [isMuted]);

  const handleTriggerBirthStar = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.triggerBirthStarAccessible();
    } else {
      setBirthStarLaunched(true);
      audioRef.current?.playInteractionChime(1.12);
    }
  }, []);

  const handleTriggerNetworkPulse = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.triggerNetworkPulseAccessible();
    } else {
      setNetworkConnections((c) => c + 5);
      audioRef.current?.playInteractionChime(1.05);
    }
  }, []);

  // Global keyboard shortcuts for full non-mouse accessibility
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (!hasEntered) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleEnter();
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      } else if (e.key === 'c' || e.key === 'C') {
        setCaptionsEnabled((v) => !v);
      } else if (e.key === 'h' || e.key === 'H') {
        setControlsCollapsed((v) => !v);
      } else if (e.key === 'r' || e.key === 'R') {
        handleReplay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSeek(filmTime + 5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(filmTime - 5);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    filmTime,
    handleEnter,
    handleReplay,
    handleSeek,
    handleToggleMute,
    handleTogglePlay,
    hasEntered,
  ]);

  return (
    <MotionConfig reducedMotion="user">
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#020308]"
      data-state={hasEntered ? (isPlaying ? 'playing' : 'paused') : 'entry'}
      data-chapter={activeChapter.id}
      data-title-revealed={isTitleRevealed(filmTime) ? 'true' : 'false'}
      data-atmosphere-cutoff={String(atmosphereState.lowpassHz)}
      data-atmosphere-swell={atmosphereState.swellIntensity.toFixed(2)}
      data-atmosphere-moment={atmosphereState.activeMoment}
      data-haptics-supported={hapticsStats.supported ? 'true' : 'false'}
      data-haptics-pulses={String(hapticsStats.pulses)}
      data-haptics-last={hapticsStats.last ?? 'none'}
    >
      {/* Isolated full-bleed WebGL canvas mount (never re-rendered by React HUD updates) */}
      {webglSupported ? (
        <div
          ref={canvasContainerRef}
          className="fixed inset-0 w-full h-full z-0"
          aria-hidden="true"
        />
      ) : (
        <WebGLFallback
          filmTime={filmTime}
          chapter={activeChapter}
          reducedMotion={false}
        />
      )}

      {/* Spoiler-free opening entry screen */}
      {!hasEntered && <EntryOverlay onEnter={handleEnter} />}

      {/* Global Framer Motion entry/exit fade for active cinematic narration overlay */}
      <AnimatePresence mode="wait">
        {hasEntered && (
          <NarrationOverlay
            key="narration-overlay"
            filmTime={filmTime}
            chapter={activeChapter}
            activeLine={activeLine}
            captionSync={captionSync}
            activeFacts={activeFacts}
            activeTrait={activeTrait}
            captionsEnabled={captionsEnabled}
            controlsCollapsed={controlsCollapsed}
            birthStarLaunched={birthStarLaunched}
            networkConnections={networkConnections}
            isComplete={isComplete}
            onTriggerBirthStar={handleTriggerBirthStar}
            onTriggerNetworkPulse={handleTriggerNetworkPulse}
            onReplay={handleReplay}
          />
        )}
      </AnimatePresence>

      {/* Active collapsible cinema controls */}
      {hasEntered && (
        <CinemaControls
          filmTime={filmTime}
          chapter={activeChapter}
          isPlaying={isPlaying}
          isMuted={isMuted}
          volume={volume}
          captionsEnabled={captionsEnabled}
          controlsCollapsed={controlsCollapsed}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onReplay={handleReplay}
          onToggleMute={handleToggleMute}
          onVolumeChange={handleVolumeChange}
          onToggleCaptions={() => setCaptionsEnabled((v) => !v)}
          onToggleCollapsed={() => setControlsCollapsed((v) => !v)}
        />
      )}
    </main>
    </MotionConfig>
  );
}
