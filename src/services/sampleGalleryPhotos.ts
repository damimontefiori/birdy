import { ExifSuggestions } from '../types/domain';
import { IdentificationRequest } from './aiBirdService';

export interface SampleTestPhoto {
  id: string;
  label: string;
  subtitle: string;
  fileName: string;
  previewUrl: string;
  presetScenario: NonNullable<IdentificationRequest['presetScenario']>;
  simulatedExif: ExifSuggestions;
}

export const SAMPLE_TEST_PHOTOS: SampleTestPhoto[] = [
  {
    id: 'sample_hornero_exif',
    label: 'Hornero en el pasto (Foto nítida + EXIF GPS)',
    subtitle: 'Caso de alta certeza con fecha y coordenadas en EXIF',
    fileName: 'IMG_20261014_084210_hornero.jpg',
    previewUrl: '/plates/acuarela_hornero.jpg',
    presetScenario: 'clara_hornero',
    simulatedExif: {
      hasExifDate: true,
      suggestedDateIso: '2026-10-14T08:42',
      hasExifGps: true,
      suggestedLat: -34.4261,
      suggestedLng: -58.5796,
      suggestedPlaceLabel: 'Jardín / Zona Norte, Buenos Aires',
      cameraDescription: 'Samsung Galaxy S24 (Cámara nativa)',
    },
  },
  {
    id: 'sample_chingolo_no_exif',
    label: 'Chingolo en rama (Foto nítida · Sin EXIF)',
    subtitle: 'Comprueba que si la galería eliminó EXIF no se inventan datos',
    fileName: 'WA_IMG_chingolo_jardin.jpg',
    previewUrl: '/plates/acuarela_chingolo.jpg',
    presetScenario: 'clara_chingolo',
    simulatedExif: {
      hasExifDate: false,
      hasExifGps: false,
    },
  },
  {
    id: 'sample_benteveo_exif',
    label: 'Benteveo común al sol (Foto nítida + EXIF)',
    subtitle: 'Alta certeza morfológica (pecho amarillo y vincha blanca)',
    fileName: 'IMG_20261016_171500_benteveo.jpg',
    previewUrl: '/plates/acuarela_benteveo.jpg',
    presetScenario: 'clara_benteveo',
    simulatedExif: {
      hasExifDate: true,
      suggestedDateIso: '2026-10-16T17:15',
      hasExifGps: true,
      suggestedLat: -34.4312,
      suggestedLng: -58.5811,
      suggestedPlaceLabel: 'Jardín / Zona Norte, Buenos Aires',
      cameraDescription: 'Motorola Edge 50 (Cámara nativa)',
    },
  },
  {
    id: 'sample_duda_similar',
    label: 'Ave a contraluz (Especies semejantes · Con duda)',
    subtitle: 'Seguridad media: ofrece candidatas (Chingolo vs. Calandria)',
    fileName: 'IMG_20260211_duda_similar_lago_puelo.jpg',
    previewUrl: '/plates/grafito_chingolo.jpg',
    presetScenario: 'duda_semillita_o_chingolo',
    simulatedExif: {
      hasExifDate: true,
      suggestedDateIso: '2026-02-11T10:20',
      hasExifGps: true,
      suggestedLat: -42.0631,
      suggestedLng: -71.6142,
      suggestedPlaceLabel: 'Comarca Andina / Lago Puelo, Chubut',
      cameraDescription: 'Samsung Galaxy S24 (Cámara nativa)',
    },
  },
  {
    id: 'sample_borrosa_oculta',
    label: 'Ave oculta y fuera de foco (Evidencia insuficiente)',
    subtitle: 'No adjudica especie arbitrariamente; sugiere guardar en Pendientes',
    fileName: 'IMG_20261018_borrosa_oculta.jpg',
    previewUrl: '/plates/grafito_hornero.jpg',
    presetScenario: 'borrosa_oculta',
    simulatedExif: {
      hasExifDate: true,
      suggestedDateIso: '2026-10-18T18:05',
      hasExifGps: false,
    },
  },
  {
    id: 'sample_sin_ave',
    label: 'Flores y helechos del jardín (Foto sin ave)',
    subtitle: 'Detecta ausencia de aves y evita inventar una identificación',
    fileName: 'IMG_20261018_sin_ave_maceta.jpg',
    previewUrl: '/plates/acuarela_zorzal.jpg',
    presetScenario: 'sin_ave',
    simulatedExif: {
      hasExifDate: false,
      hasExifGps: false,
    },
  },
];
