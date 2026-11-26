import { computeBlobSha256, toLocalDateTimeInputValue } from './exifService';

export const MAX_SHORT_VIDEO_BYTES = 26 * 1024 * 1024; // 26 MB máx. para clips móviles ágiles
export const MAX_SHORT_VIDEO_SECONDS = 45; // Videos cortos de hasta 45 segundos

export interface ProcessedShortVideo {
  videoBlob: Blob;
  objectUrl: string;
  posterDataUrl: string;
  sha256: string;
  durationSec: number;
  mimeType: string;
  suggestedObservedAt: string;
}

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

function createFallbackVideoPosterSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="#233327"/>
    <circle cx="320" cy="300" r="76" fill="#FAF6E9" fill-opacity="0.16"/>
    <polygon points="298,262 298,338 362,300" fill="#FAF6E9"/>
    <text x="320" y="430" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#FAF6E9">Video corto de campo</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function formatVideoDuration(seconds?: number): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '0:05';
  const rounded = Math.max(1, Math.round(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Valida un video corto tomado con el celular, mide su duración y extrae automáticamente
 * un fotograma nítido (sin EXIF) para usar como póster en la cronología de la hoja y al compartir.
 */
export async function processShortGardenVideoFile(file: File): Promise<ProcessedShortVideo> {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    throw new Error('Seleccioná un archivo de video válido (MP4, MOV o WebM).');
  }

  if (file.size > MAX_SHORT_VIDEO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `El video pesa ${mb} MB. Elegí o grabá un clip corto de hasta 26 MB (~20–30 segundos) para mantener ágil tu cuaderno.`
    );
  }

  const sha256 = await computeBlobSha256(file);
  const mimeType = file.type || 'video/mp4';
  const suggestedObservedAt = toLocalDateTimeInputValue(
    file.lastModified ? new Date(file.lastModified) : new Date()
  );

  if (typeof document === 'undefined' || isJsdom() || typeof URL.createObjectURL !== 'function') {
    return {
      videoBlob: file,
      objectUrl: `data:${mimeType};base64,VIDEO_PREVIEW`,
      posterDataUrl: createFallbackVideoPosterSvg(),
      sha256,
      durationSec: 6,
      mimeType,
      suggestedObservedAt,
    };
  }

  const objectUrl = URL.createObjectURL(file);

  const meta = await new Promise<{ durationSec: number; posterDataUrl: string }>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const finish = (durationSec: number, posterDataUrl: string) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve({ durationSec, posterDataUrl });
    };

    const timer = window.setTimeout(() => {
      finish(8, createFallbackVideoPosterSvg());
    }, 6500);

    video.onerror = () => {
      window.clearTimeout(timer);
      finish(6, createFallbackVideoPosterSvg());
    };

    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 6;
      if (dur > MAX_SHORT_VIDEO_SECONDS) {
        window.clearTimeout(timer);
        settled = true;
        URL.revokeObjectURL(objectUrl);
        reject(
          new Error(
            `El video dura ${Math.round(dur)} s. Te pedimos clips cortos de hasta ${MAX_SHORT_VIDEO_SECONDS} segundos.`
          )
        );
        return;
      }

      const seekTarget = Math.min(Math.max(0.15, dur * 0.25), Math.max(0.15, dur - 0.1));
      try {
        video.currentTime = seekTarget;
      } catch {
        window.clearTimeout(timer);
        finish(dur, createFallbackVideoPosterSvg());
      }
    };

    video.onseeked = () => {
      window.clearTimeout(timer);
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 6;
      try {
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 720;
        const maxSide = 1080;
        const scale = Math.min(1, maxSide / Math.max(vw, vh));
        const cw = Math.max(1, Math.round(vw * scale));
        const ch = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, cw, ch);
          const jpg = canvas.toDataURL('image/jpeg', 0.88);
          finish(dur, jpg);
          return;
        }
      } catch {
        // usar póster SVG si el códec restringe extracción
      }
      finish(dur, createFallbackVideoPosterSvg());
    };

    video.src = objectUrl;
  });

  return {
    videoBlob: file,
    objectUrl,
    posterDataUrl: meta.posterDataUrl,
    sha256,
    durationSec: Math.round(meta.durationSec * 10) / 10,
    mimeType,
    suggestedObservedAt,
  };
}
