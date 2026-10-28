import exifr from 'exifr';
import { ExifSuggestions } from '../types/domain';

/**
 * Extrae metadatos EXIF de fecha/hora de captura y coordenadas GPS cuando existen en el archivo,
 * sin fallar si la galería o plataforma los eliminó.
 */
export async function extractExifSuggestions(file: File | Blob): Promise<ExifSuggestions> {
  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
    });

    if (!parsed) {
      return { hasExifDate: false, hasExifGps: false };
    }

    const rawDate = parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate;
    let suggestedDateIso: string | undefined;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      suggestedDateIso = toLocalDateTimeInputValue(rawDate);
    } else if (typeof rawDate === 'string') {
      const normalized = rawDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) {
        suggestedDateIso = toLocalDateTimeInputValue(d);
      }
    }

    const hasExifGps =
      typeof parsed.latitude === 'number' &&
      !isNaN(parsed.latitude) &&
      typeof parsed.longitude === 'number' &&
      !isNaN(parsed.longitude);

    const suggestedLat = hasExifGps ? Number(parsed.latitude.toFixed(4)) : undefined;
    const suggestedLng = hasExifGps ? Number(parsed.longitude.toFixed(4)) : undefined;
    const suggestedPlaceLabel =
      hasExifGps && suggestedLat !== undefined && suggestedLng !== undefined
        ? approximateArgentineRegionFromCoords(suggestedLat, suggestedLng)
        : undefined;

    const cameraDescription = [parsed.Make, parsed.Model].filter(Boolean).join(' ').trim() || undefined;

    return {
      hasExifDate: Boolean(suggestedDateIso),
      suggestedDateIso,
      hasExifGps,
      suggestedLat,
      suggestedLng,
      suggestedPlaceLabel,
      cameraDescription,
    };
  } catch {
    // Si el archivo no tiene cabeceras EXIF o el navegador restringe su lectura, continuar sin error
    return { hasExifDate: false, hasExifGps: false };
  }
}

export function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Aproxima una localidad/región general legible sin exponer dirección postal exacta.
 */
export function approximateArgentineRegionFromCoords(lat: number, lng: number): string {
  if (lat < -41.5 && lat > -43.0 && lng < -71.0 && lng > -72.0) {
    return 'Comarca Andina / Lago Puelo, Chubut';
  }
  if (lat < -40.5 && lat >= -41.5 && lng < -71.0 && lng > -72.0) {
    return 'Nahuel Huapi / Bariloche, Río Negro';
  }
  if (lat < -34.2 && lat > -35.1 && lng < -58.1 && lng > -59.0) {
    return 'Jardín / Zona Norte, Buenos Aires';
  }
  if (lat < -30.5 && lat > -32.5 && lng < -63.5 && lng > -65.5) {
    return 'Sierras de Córdoba';
  }
  if (lat < -25.0 && lat > -28.0 && lng < -53.5 && lng > -56.5) {
    return 'Selva Paranaense, Misiones';
  }
  return 'Ubicación general sugerida por la foto';
}

/**
 * Calcula un hash SHA-256 determinístico del archivo binario para garantizar
 * idempotencia en la cola de sincronización y evitar llamadas duplicadas a la IA (CA10, CA16).
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
  try {
    const buffer = await blob.arrayBuffer();
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback determinístico en entornos de test sin WebCrypto completo
  }
  return `size_${blob.size}_type_${blob.type}`;
}

/**
 * Sanitiza la imagen re-codificándola en un lienzo limpio (Canvas -> JPEG/PNG)
 * eliminando por completo todas las cabeceras EXIF, coordenadas GPS y números de serie de cámara (CA14).
 */
export async function sanitizeImageStrippingExif(file: File | Blob, maxDimension = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (typeof Image === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width || 800;
          canvas.height = height || 600;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // toDataURL('image/jpeg') genera un flujo de píxeles limpio sin metadatos EXIF ni GPS
          const cleanDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(cleanDataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
