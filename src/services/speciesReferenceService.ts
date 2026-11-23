import {
  buildStableTaxonIdFromScientificName,
  findSpeciesByScientificName,
  inferOrganismGroupFromMeta,
  registerCustomSpecies,
} from '../data/argentinaBirdsCatalog';
import {
  ORGANISM_GROUP_META,
  OrganismGroup,
  SpeciesCatalogEntry,
  SpeciesReferencePhoto,
} from '../types/domain';

interface CachedReference {
  savedAt: number;
  photos: SpeciesReferencePhoto[];
  wikipediaUrl?: string;
  inaturalistTaxonId?: number;
}

const STORAGE_CACHE_KEY = 'birdy_species_ref_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

const memoryCache = new Map<string, CachedReference>();
const inflightRequests = new Map<string, Promise<SpeciesReferencePhoto[]>>();

function isTestEnvironment(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent || '')
  );
}

function getApiBase(): string {
  const custom = import.meta.env.VITE_BACKEND_API_URL;
  return custom ? custom.replace(/\/$/, '') : '';
}

function upgradeInatUrl(url: string, size: 'medium' | 'large'): string {
  if (!url) return url;
  return url.replace(/\/(square|small|medium|large|original)\./, `/${size}.`);
}

function loadStorageCache(): Record<string, CachedReference> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CachedReference>) : {};
  } catch {
    return {};
  }
}

function persistCacheEntry(key: string, entry: CachedReference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const store = loadStorageCache();
    store[key] = entry;
    // Mantener acotado el tamaño en localStorage (máximo 120 especies)
    const keys = Object.keys(store);
    if (keys.length > 120) {
      keys
        .sort((a, b) => (store[a]?.savedAt || 0) - (store[b]?.savedAt || 0))
        .slice(0, keys.length - 120)
        .forEach((oldKey) => delete store[oldKey]);
    }
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(store));
  } catch {
    // Ignorar límite de cuota
  }
}

export function getProxiedImageUrl(url: string): string {
  if (!url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('blob:')) {
    return url;
  }
  const base = getApiBase();
  return `${base}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Obtiene fotografías reales de referencia (iNaturalist) para comparar una especie propuesta
 * directamente dentro de la app sin tener que salir a buscar en internet.
 */
export async function fetchReferencePhotosForSpecies(
  scientificName: string
): Promise<SpeciesReferencePhoto[]> {
  const cleanSci = scientificName.trim();
  if (!cleanSci || isTestEnvironment()) return [];

  const cacheKey = cleanSci.toLowerCase();

  // 1. Caché en memoria
  const mem = memoryCache.get(cacheKey);
  if (mem && Date.now() - mem.savedAt < CACHE_TTL_MS && mem.photos.length > 0) {
    return mem.photos;
  }

  // 2. Caché en localStorage (útil incluso al volver sin buena señal)
  const disk = loadStorageCache()[cacheKey];
  if (disk && Date.now() - disk.savedAt < CACHE_TTL_MS && disk.photos.length > 0) {
    memoryCache.set(cacheKey, disk);
    return disk.photos;
  }

  // 3. Deduplicar consultas en paralelo
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)!;
  }

  const task = (async (): Promise<SpeciesReferencePhoto[]> => {
    try {
      const apiBase = getApiBase();
      let photos: SpeciesReferencePhoto[] = [];
      let wikipediaUrl: string | undefined;
      let inatTaxonId: number | undefined;

      // Primero intentar vía backend propio (/api/bird-reference) que trae múltiples ángulos
      try {
        const res = await fetch(
          `${apiBase}/api/bird-reference?scientificName=${encodeURIComponent(cleanSci)}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            species?: {
              referencePhotos?: SpeciesReferencePhoto[];
              wikipediaUrl?: string;
              inaturalistTaxonId?: number;
            } | null;
          };
          if (data.species?.referencePhotos?.length) {
            photos = data.species.referencePhotos;
            wikipediaUrl = data.species.wikipediaUrl;
            inatTaxonId = data.species.inaturalistTaxonId;
          }
        }
      } catch {
        // Fallback directo a iNaturalist (CORS habilitado, sin headers personalizados)
      }

      if (photos.length === 0) {
        const directRes = await fetch(
          `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
            cleanSci
          )}&taxon_id=1&locale=es-AR&preferred_place_id=7190&per_page=4`
        );
        if (directRes.ok) {
          const json = (await directRes.json()) as {
            results?: Array<{
              id?: number;
              name?: string;
              wikipedia_url?: string;
              default_photo?: { medium_url?: string; url?: string; attribution?: string };
            }>;
          };
          const match =
            (json.results || []).find(
              (r) => (r.name || '').toLowerCase() === cleanSci.toLowerCase()
            ) || json.results?.[0];

          if (match) {
            inatTaxonId = match.id;
            wikipediaUrl = match.wikipedia_url;
            const base = match.default_photo?.medium_url || match.default_photo?.url;
            if (base) {
              photos = [
                {
                  url: upgradeInatUrl(base, 'large'),
                  thumbUrl: upgradeInatUrl(base, 'medium'),
                  attribution: match.default_photo?.attribution || 'iNaturalist',
                  source: 'iNaturalist',
                },
              ];
            }
          }
        }
      }

      if (photos.length > 0) {
        const entry: CachedReference = {
          savedAt: Date.now(),
          photos,
          wikipediaUrl,
          inaturalistTaxonId: inatTaxonId,
        };
        memoryCache.set(cacheKey, entry);
        persistCacheEntry(cacheKey, entry);

        const existing = findSpeciesByScientificName(cleanSci);
        if (existing) {
          registerCustomSpecies({
            ...existing,
            referencePhotos: photos,
            wikipediaUrl: wikipediaUrl || existing.wikipediaUrl,
            inaturalistTaxonId: inatTaxonId || existing.inaturalistTaxonId,
          });
        }
      }

      return photos;
    } catch {
      return [];
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, task);
  return task;
}

/**
 * Busca fauna y polinizadores en vivo en iNaturalist (Reino Animalia: aves, mariposas,
 * abejas, abejorros, insectos, arañas y fauna vecina) para encontrar cualquier especie
 * que no figure todavía en el catálogo inicial de Argentina.
 */
export async function searchLiveBirdsInNaturalist(
  query: string
): Promise<SpeciesCatalogEntry[]> {
  const clean = query.trim();
  if (clean.length < 2 || isTestEnvironment()) return [];

  try {
    const apiBase = getApiBase();
    let rawResults: Array<{
      inaturalistTaxonId: number;
      scientificName: string;
      commonNameAr: string;
      iconicTaxonName?: string;
      organismGroup?: OrganismGroup;
      wikipediaUrl?: string;
      referencePhotos: SpeciesReferencePhoto[];
    }> = [];

    try {
      const res = await fetch(`${apiBase}/api/bird-reference?q=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const json = (await res.json()) as { results?: typeof rawResults };
        rawResults = json.results || [];
      }
    } catch {
      // Fallback directo CORS
    }

    if (rawResults.length === 0) {
      const directRes = await fetch(
        `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
          clean
        )}&taxon_id=1&rank=species,genus&locale=es-AR&preferred_place_id=7190&per_page=10`
      );
      if (directRes.ok) {
        const json = (await directRes.json()) as {
          results?: Array<{
            id: number;
            name: string;
            preferred_common_name?: string;
            iconic_taxon_name?: string;
            wikipedia_url?: string;
            default_photo?: { medium_url?: string; url?: string; attribution?: string };
          }>;
        };
        rawResults = (json.results || []).map((t) => {
          const base = t.default_photo?.medium_url || t.default_photo?.url || '';
          const commonAr = t.preferred_common_name || t.name;
          return {
            inaturalistTaxonId: t.id,
            scientificName: t.name,
            commonNameAr: commonAr,
            iconicTaxonName: t.iconic_taxon_name,
            organismGroup: inferOrganismGroupFromMeta({
              iconicTaxonName: t.iconic_taxon_name,
              scientificName: t.name,
              commonName: commonAr,
            }),
            wikipediaUrl: t.wikipedia_url,
            referencePhotos: base
              ? [
                  {
                    url: upgradeInatUrl(base, 'large'),
                    thumbUrl: upgradeInatUrl(base, 'medium'),
                    attribution: t.default_photo?.attribution || 'iNaturalist',
                    source: 'iNaturalist',
                  },
                ]
              : [],
          };
        });
      }
    }

    return rawResults.map((item) => {
      const existing = findSpeciesByScientificName(item.scientificName);
      if (existing) {
        return registerCustomSpecies({
          ...existing,
          referencePhotos: item.referencePhotos.length
            ? item.referencePhotos
            : existing.referencePhotos,
          wikipediaUrl: item.wikipediaUrl || existing.wikipediaUrl,
          inaturalistTaxonId: item.inaturalistTaxonId || existing.inaturalistTaxonId,
        });
      }

      const group = inferOrganismGroupFromMeta({
        organismGroup: item.organismGroup,
        iconicTaxonName: item.iconicTaxonName,
        scientificName: item.scientificName,
        commonName: item.commonNameAr,
      });
      const groupMeta = ORGANISM_GROUP_META[group];

      const entry: SpeciesCatalogEntry = {
        taxonId: buildStableTaxonIdFromScientificName(item.scientificName),
        organismGroup: group,
        scientificName: item.scientificName,
        commonNameAr: item.commonNameAr,
        alternativeNames: [],
        family: item.iconicTaxonName
          ? `${item.iconicTaxonName} · ${groupMeta.label}`
          : `${groupMeta.label} (iNaturalist)`,
        quickSummary: `${item.commonNameAr} (${item.scientificName}) registrada en el catálogo naturalista de iNaturalist.`,
        ecologicalRole: `Especie de ${groupMeta.label.toLowerCase()} documentada en tu bioma`,
        identificationTraits: `Compará colores, formas y silueta con las fotografías de referencia de ${item.commonNameAr}.`,
        typicalBehavior: 'Observación incorporada desde el catálogo naturalista ampliado (iNaturalist).',
        dietAndHabitat: 'Consultar notas locales según el jardín o región del encuentro.',
        generalDistribution: 'Fauna documentada en iNaturalist.',
        typicalRegionsAr: [],
        referencePhotos: item.referencePhotos,
        wikipediaUrl: item.wikipediaUrl,
        inaturalistTaxonId: item.inaturalistTaxonId,
      };
      return registerCustomSpecies(entry);
    });
  } catch {
    return [];
  }
}
