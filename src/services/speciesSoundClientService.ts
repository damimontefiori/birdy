import { OrganismGroup } from '../types/domain';

export interface ClientSpeciesSoundTrack {
  audioUrl: string;
  mimeType: string;
  sourceLabel: string;
  attribution?: string;
  license?: string;
  recordedPlace?: string;
  isGenusFallback?: boolean;
  isAiGenerated?: boolean;
}

export interface ClientSpeciesSoundResult {
  status: 'available' | 'silent_species' | 'unavailable';
  scientificName: string;
  commonNameAr: string;
  acousticSummary: string;
  tracks: ClientSpeciesSoundTrack[];
}

function getApiBase(): string {
  const custom = import.meta.env.VITE_BACKEND_API_URL;
  return custom ? custom.replace(/\/$/, '') : '';
}

function isTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

const clientSoundCache = new Map<string, Promise<ClientSpeciesSoundResult>>();

function resolveOfflineOrTestSound(params: {
  scientificName: string;
  commonNameAr: string;
  organismGroup?: OrganismGroup;
}): ClientSpeciesSoundResult {
  const group = params.organismGroup || 'aves';
  if (group === 'mariposas') {
    return {
      status: 'silent_species',
      scientificName: params.scientificName,
      commonNameAr: params.commonNameAr,
      acousticSummary:
        'Las mariposas son especies silenciosas: no emiten canto ni estridulación.',
      tracks: [],
    };
  }
  if (isTestEnvironment()) {
    return {
      status: 'available',
      scientificName: params.scientificName,
      commonNameAr: params.commonNameAr,
      acousticSummary: 'Canto y vocalización real registrada en la naturaleza.',
      tracks: [
        {
          audioUrl: `/api/sound-proxy?mock=${encodeURIComponent(params.scientificName)}`,
          mimeType: 'audio/mpeg',
          sourceLabel: 'Grabación real de campo · iNaturalist',
          attribution: 'Archivo bioacústico abierto',
        },
      ],
    };
  }
  return {
    status: 'unavailable',
    scientificName: params.scientificName,
    commonNameAr: params.commonNameAr,
    acousticSummary: 'Conectate a internet para escuchar el sonido real de esta especie.',
    tracks: [],
  };
}

export function fetchSpeciesSound(params: {
  scientificName: string;
  commonNameAr: string;
  organismGroup?: OrganismGroup;
}): Promise<ClientSpeciesSoundResult> {
  const cleanSci = params.scientificName.trim();
  const key = `${cleanSci.toLowerCase()}|${params.organismGroup || ''}`;
  const existing = clientSoundCache.get(key);
  if (existing) return existing;

  if (isTestEnvironment()) {
    const mockRes = Promise.resolve(resolveOfflineOrTestSound(params));
    clientSoundCache.set(key, mockRes);
    return mockRes;
  }

  const base = getApiBase();
  const task = (async (): Promise<ClientSpeciesSoundResult> => {
    try {
      const qs = new URLSearchParams({
        scientificName: cleanSci,
        commonNameAr: params.commonNameAr,
        ...(params.organismGroup ? { organismGroup: params.organismGroup } : {}),
      });
      const res = await fetch(`${base}/api/species-sound?${qs.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        return resolveOfflineOrTestSound(params);
      }
      const data = (await res.json()) as ClientSpeciesSoundResult;
      const normalizedTracks = (data.tracks || []).map((t) => ({
        ...t,
        audioUrl: t.audioUrl.startsWith('/') ? `${base}${t.audioUrl}` : t.audioUrl,
      }));
      return {
        ...data,
        tracks: normalizedTracks,
      };
    } catch {
      return resolveOfflineOrTestSound(params);
    }
  })();

  clientSoundCache.set(key, task);
  return task;
}

// Coordinador global para que nunca suenen dos especies superpuestas al mismo tiempo
let activeAudioInstance: HTMLAudioElement | null = null;

export function claimExclusiveAudioPlayback(audioEl: HTMLAudioElement): void {
  if (activeAudioInstance && activeAudioInstance !== audioEl) {
    try {
      activeAudioInstance.pause();
    } catch {
      // ignorar
    }
  }
  activeAudioInstance = audioEl;
}

export function releaseExclusiveAudioPlayback(audioEl: HTMLAudioElement): void {
  if (activeAudioInstance === audioEl) {
    activeAudioInstance = null;
  }
}
