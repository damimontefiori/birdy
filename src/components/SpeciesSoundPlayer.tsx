import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import {
  claimExclusiveAudioPlayback,
  ClientSpeciesSoundResult,
  fetchSpeciesSound,
  releaseExclusiveAudioPlayback,
} from '../services/speciesSoundClientService';
import { OrganismGroup } from '../types/domain';

interface SpeciesSoundPlayerProps {
  scientificName: string;
  commonNameAr: string;
  organismGroup?: OrganismGroup;
  compact?: boolean;
}

function formatSec(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

function safePauseAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  try {
    if (!audio.paused) {
      audio.pause();
    }
  } catch {
    // ignorar en entornos sin implementación de audio (ej. jsdom)
  }
}

/**
 * Reproductor bioacústico de la especie registrada (aves, polinizadores, grillos/chicharras y anfibios),
 * con distinción honesta entre grabaciones científicas de campo, recreación acústica IA y especies silenciosas.
 */
export const SpeciesSoundPlayer: React.FC<SpeciesSoundPlayerProps> = ({
  scientificName,
  commonNameAr,
  organismGroup,
  compact = false,
}) => {
  const [soundData, setSoundData] = useState<ClientSpeciesSoundResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [trackIndex, setTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playError, setPlayError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setIsPlaying(false);
    setTrackIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setPlayError(null);

    if (audioRef.current) {
      safePauseAudio(audioRef.current);
      releaseExclusiveAudioPlayback(audioRef.current);
    }

    void fetchSpeciesSound({ scientificName, commonNameAr, organismGroup }).then((res) => {
      if (!active) return;
      setSoundData(res);
      setIsLoading(false);
    });

    return () => {
      active = false;
      if (audioRef.current) {
        safePauseAudio(audioRef.current);
        releaseExclusiveAudioPlayback(audioRef.current);
      }
    };
  }, [scientificName, commonNameAr, organismGroup]);

  const activeTrack = soundData?.tracks?.[trackIndex] || null;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    setPlayError(null);

    if (isPlaying) {
      safePauseAudio(audio);
      setIsPlaying(false);
      releaseExclusiveAudioPlayback(audio);
      return;
    }

    try {
      claimExclusiveAudioPlayback(audio);
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      releaseExclusiveAudioPlayback(audio);
      if (soundData && trackIndex + 1 < soundData.tracks.length) {
        setTrackIndex((i) => i + 1);
      } else {
        setPlayError('No pudimos reproducir este archivo de audio en tu navegador.');
      }
    }
  };

  const handleSelectTrack = (idx: number) => {
    if (idx === trackIndex) return;
    if (audioRef.current) {
      safePauseAudio(audioRef.current);
      releaseExclusiveAudioPlayback(audioRef.current);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlayError(null);
    setTrackIndex(idx);
  };

  if (isLoading) {
    return (
      <div className={`sound-player-card ${compact ? 'compact' : ''}`} aria-live="polite">
        <div className="sound-player-row">
          <span className="sound-play-btn loading" aria-hidden="true">
            <Loader2 size={16} className="spin" />
          </span>
          <div className="sound-meta-col">
            <span className="sound-title-text">Buscando sonido de {commonNameAr}…</span>
            <span className="sound-sub-text">Consultando archivo bioacústico de campo</span>
          </div>
        </div>
      </div>
    );
  }

  if (!soundData || soundData.status === 'silent_species') {
    return (
      <div className={`sound-player-card silent ${compact ? 'compact' : ''}`}>
        <div className="sound-player-row">
          <span className="sound-silent-icon" aria-hidden="true">
            <VolumeX size={16} />
          </span>
          <div className="sound-meta-col">
            <span className="sound-title-text">Especie silenciosa</span>
            <span className="sound-sub-text">
              {soundData?.acousticSummary ||
                'Esta especie no emite canto ni vocalización audible.'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (soundData.status === 'unavailable' || !activeTrack) {
    return (
      <div className={`sound-player-card silent ${compact ? 'compact' : ''}`}>
        <div className="sound-player-row">
          <span className="sound-silent-icon" aria-hidden="true">
            <Volume2 size={16} />
          </span>
          <div className="sound-meta-col">
            <span className="sound-title-text">Audio aún no disponible</span>
            <span className="sound-sub-text">{soundData.acousticSummary}</span>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className={`sound-player-card ${isPlaying ? 'playing' : ''} ${compact ? 'compact' : ''}`}>
      <audio
        ref={audioRef}
        src={activeTrack.audioUrl}
        preload="none"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (audioRef.current) releaseExclusiveAudioPlayback(audioRef.current);
        }}
        onPause={() => setIsPlaying(false)}
      />

      <div className="sound-player-row">
        <button
          type="button"
          className={`sound-play-btn ${isPlaying ? 'active' : ''}`}
          onClick={() => void togglePlayback()}
          aria-label={
            isPlaying
              ? `Pausar sonido de ${commonNameAr}`
              : `Escuchar sonido de ${commonNameAr}`
          }
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
        </button>

        <div className="sound-meta-col">
          <div className="sound-head-line">
            <span className="sound-title-text">
              <Volume2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {isPlaying ? `Escuchando a ${commonNameAr}` : `Escuchar sonido de ${commonNameAr}`}
            </span>
            <span className={`sound-origin-badge ${activeTrack.isAiGenerated ? 'ai' : 'real'}`}>
              {activeTrack.isAiGenerated ? 'IA Bioacústica' : 'Grabación real'}
            </span>
          </div>

          <div className="sound-progress-wrap">
            <div
              className="sound-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPct)}
              onClick={(e) => {
                if (!audioRef.current || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audioRef.current.currentTime = ratio * duration;
                setCurrentTime(ratio * duration);
              }}
            >
              <div className="sound-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>

            <div className="sound-wave-bars" aria-hidden="true">
              <span className={isPlaying ? 'anim b1' : 'b1'} />
              <span className={isPlaying ? 'anim b2' : 'b2'} />
              <span className={isPlaying ? 'anim b3' : 'b3'} />
              <span className={isPlaying ? 'anim b4' : 'b4'} />
            </div>

            <span className="sound-time-label">
              {duration > 0 ? `${formatSec(currentTime)} / ${formatSec(duration)}` : 'Audio'}
            </span>
          </div>

          <div className="sound-credit-row">
            <span>
              {activeTrack.sourceLabel}
              {activeTrack.recordedPlace ? ` · ${activeTrack.recordedPlace}` : ''}
              {activeTrack.attribution ? ` · ${activeTrack.attribution}` : ''}
            </span>

            {soundData.tracks.length > 1 && (
              <div className="sound-alt-takes">
                {soundData.tracks.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`sound-take-chip ${i === trackIndex ? 'active' : ''}`}
                    onClick={() => handleSelectTrack(i)}
                  >
                    Toma #{i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {playError && <div className="sound-error-msg">{playError}</div>}
        </div>
      </div>
    </div>
  );
};
